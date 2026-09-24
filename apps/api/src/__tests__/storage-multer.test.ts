import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// In-memory simulation of PostgreSQL `stored_files` table
const mockFileTable = new Map<string, any>();

vi.mock("@coheronconnect/db", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getDb: () => ({
      insert: () => ({
        values: (val: any) => ({
          onConflictDoUpdate: ({ set }: any) => {
            mockFileTable.set(val.storageKey, { ...val, ...set });
            return Promise.resolve();
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: (_cond: any) => ({
            limit: () => {
              const entries = Array.from(mockFileTable.values());
              return Promise.resolve(entries.length > 0 ? [entries[entries.length - 1]] : []);
            },
          }),
        }),
      }),
      delete: () => ({
        where: (_cond: any) => {
          mockFileTable.clear();
          return Promise.resolve();
        },
      }),
    }),
  };
});

import {
  putObject,
  getObject,
  getStoredFile,
  deleteObject,
  signedDownloadUrl,
  buildDocumentKey,
  isStorageConfigured,
  multerUpload,
} from "../services/storage";

describe("storage-multer service (in-database PostgreSQL storage)", () => {
  const testOrgId = "test-org-123";
  const testKey = "documents/doc-456/v1.pdf";
  const testContent = Buffer.from("Hello CoheronConnect PostgreSQL BYTEA Storage via Multer!");

  beforeEach(() => {
    mockFileTable.clear();
  });

  afterEach(() => {
    delete process.env["STORAGE_DISABLED"];
    mockFileTable.clear();
  });

  it("isStorageConfigured returns true by default and false when disabled", () => {
    expect(isStorageConfigured()).toBe(true);
    process.env["STORAGE_DISABLED"] = "true";
    expect(isStorageConfigured()).toBe(false);
  });

  it("buildDocumentKey generates canonical versioned key with sanitized extension", () => {
    const key = buildDocumentKey("doc-abc", 1, "pdf");
    expect(key).toBe("documents/doc-abc/v1.pdf");

    const keyUnsafe = buildDocumentKey("doc-abc", 2, ".tar.gz!$");
    expect(keyUnsafe).toBe("documents/doc-abc/v2.tar.gz");
  });

  it("putObject stores file directly in PostgreSQL stored_files table", async () => {
    const put = await putObject({
      orgId: testOrgId,
      key: testKey,
      body: testContent,
      mimeType: "application/pdf",
    });

    expect(put.key).toBe(`${testOrgId}/${testKey}`);
    expect(put.sizeBytes).toBe(testContent.length);
    expect(put.sha256).toBeDefined();
    expect(put.sha256.length).toBe(64); // SHA-256 hex length

    // Verify row in PostgreSQL stored_files simulation
    const stored = mockFileTable.get(put.key);
    expect(stored).toBeDefined();
    expect(stored.data.equals(testContent)).toBe(true);
    expect(stored.mimeType).toBe("application/pdf");
  });

  it("getObject fetches file binary directly from PostgreSQL as buffer", async () => {
    const put = await putObject({
      orgId: testOrgId,
      key: testKey,
      body: testContent,
      mimeType: "application/pdf",
    });

    const fetched = await getObject(put.key);
    expect(fetched.equals(testContent)).toBe(true);
  });

  it("getStoredFile returns full record with mimeType and sizeBytes", async () => {
    const put = await putObject({
      orgId: testOrgId,
      key: testKey,
      body: testContent,
      mimeType: "application/pdf",
    });

    const record = await getStoredFile(put.key);
    expect(record).not.toBeNull();
    expect(record?.mimeType).toBe("application/pdf");
    expect(record?.sizeBytes).toBe(testContent.length);
    expect(record?.data.equals(testContent)).toBe(true);
  });

  it("signedDownloadUrl returns API file stream endpoint", async () => {
    const url = await signedDownloadUrl(`${testOrgId}/${testKey}`, 300);
    expect(url).toBe(`/api/files/${encodeURIComponent(`${testOrgId}/${testKey}`)}`);
  });

  it("deleteObject removes record from PostgreSQL stored_files table", async () => {
    const put = await putObject({
      orgId: testOrgId,
      key: testKey,
      body: testContent,
      mimeType: "application/pdf",
    });

    expect(mockFileTable.has(put.key)).toBe(true);
    await deleteObject(put.key);
    expect(mockFileTable.size).toBe(0);
  });

  it("exports Multer with memoryStorage for RAM-only buffering", () => {
    expect(multerUpload).toBeDefined();
    expect(typeof multerUpload.single).toBe("function");
    expect(typeof multerUpload.array).toBe("function");
  });

  describe("Fastify Route Aliases for DB-backed File Serving & Upload", () => {
    let app: any;

    beforeEach(async () => {
      const Fastify = (await import("fastify")).default;
      app = Fastify();

      const fileStreamHandler = async (req: any, reply: any) => {
        const rawKey = (req.params as any)["*"];
        if (!rawKey) return reply.status(400).send({ error: "Missing file key" });
        const file = await getStoredFile(decodeURIComponent(rawKey));
        if (!file) return reply.status(404).send({ error: "File not found" });

        reply.header("Content-Type", file.mimeType);
        reply.header("Content-Length", file.sizeBytes);
        reply.header("Cache-Control", "public, max-age=86400, immutable");
        return reply.send(file.data);
      };

      app.addContentTypeParser(
        "multipart/form-data",
        (_req: any, _payload: any, done: any) => {
          done(null);
        },
      );

      app.get("/files/*", fileStreamHandler);
      app.get("/api/files/*", fileStreamHandler);
      app.get("/uploads/*", fileStreamHandler);

      const uploadHandler = async (req: any, reply: any) => {
        return new Promise((resolve) => {
          multerUpload.single("file")(req.raw as any, reply.raw as any, async (err: any) => {
            if (err) {
              reply.status(400).send({ error: err.message });
              return resolve(undefined);
            }
            const file = (req.raw as any).file;
            if (!file || !file.buffer) {
              reply.status(400).send({ error: "No file uploaded" });
              return resolve(undefined);
            }
            const orgId = (req.headers["x-org-id"] as string) || "public";
            const ext = (file.originalname || "").split(".").pop() || "bin";
            const key = `uploads/${Date.now()}-mock-uuid.${ext}`;

            try {
              const put = await putObject({
                orgId,
                key,
                body: file.buffer,
                mimeType: file.mimetype || "application/octet-stream",
              });

              reply.send({
                ok: true,
                storageKey: put.key,
                sha256: put.sha256,
                mimeType: file.mimetype,
                sizeBytes: put.sizeBytes,
                url: `/api/files/${encodeURIComponent(put.key)}`,
              });
            } catch (e: any) {
              reply.status(500).send({ error: e.message || "Failed to store file in database" });
            }
            resolve(undefined);
          });
        });
      };

      app.post("/upload", uploadHandler);
      app.post("/api/upload", uploadHandler);

      await app.ready();
    });

    afterEach(async () => {
      if (app) await app.close();
    });

    it("serves DB-stored file via Caddy-stripped route /files/*", async () => {
      const put = await putObject({
        orgId: testOrgId,
        key: testKey,
        body: testContent,
        mimeType: "application/pdf",
      });

      const res = await app.inject({
        method: "GET",
        url: `/files/${encodeURIComponent(put.key)}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.rawPayload.equals(testContent)).toBe(true);
    });

    it("serves DB-stored file via unstripped route /api/files/*", async () => {
      const put = await putObject({
        orgId: testOrgId,
        key: testKey,
        body: testContent,
        mimeType: "application/pdf",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/files/${encodeURIComponent(put.key)}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.rawPayload.equals(testContent)).toBe(true);
    });

    it("serves DB-stored file via legacy alias route /uploads/*", async () => {
      const put = await putObject({
        orgId: testOrgId,
        key: testKey,
        body: testContent,
        mimeType: "application/pdf",
      });

      const res = await app.inject({
        method: "GET",
        url: `/uploads/${encodeURIComponent(put.key)}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.rawPayload.equals(testContent)).toBe(true);
    });

    it("returns 404 for nonexistent DB file on all stream routes", async () => {
      const res1 = await app.inject({ method: "GET", url: "/files/nonexistent.pdf" });
      expect(res1.statusCode).toBe(404);

      const res2 = await app.inject({ method: "GET", url: "/api/files/nonexistent.pdf" });
      expect(res2.statusCode).toBe(404);

      const res3 = await app.inject({ method: "GET", url: "/uploads/nonexistent.pdf" });
      expect(res3.statusCode).toBe(404);
    });

    it("rejects request with 400 when no file is uploaded on both /upload and /api/upload", async () => {
      const boundary = "---------------------------boundary123";
      const emptyForm = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="dummy"',
        "",
        "value",
        `--${boundary}--`,
        "",
      ].join("\r\n");

      const res1 = await app.inject({
        method: "POST",
        url: "/upload",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: emptyForm,
      });
      expect(res1.statusCode).toBe(400);
      expect(JSON.parse(res1.body).error).toBe("No file uploaded");

      const res2 = await app.inject({
        method: "POST",
        url: "/api/upload",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: emptyForm,
      });
      expect(res2.statusCode).toBe(400);
      expect(JSON.parse(res2.body).error).toBe("No file uploaded");
    });

    it("successfully uploads file via /upload (Caddy route) and persists directly in DB stored_files", async () => {
      const boundary = "---------------------------boundary456";
      const filePayload = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="sample.pdf"',
        "Content-Type: application/pdf",
        "",
        testContent.toString(),
        `--${boundary}--`,
        "",
      ].join("\r\n");

      const res = await app.inject({
        method: "POST",
        url: "/upload",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "x-org-id": testOrgId,
        },
        payload: filePayload,
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
      expect(data.storageKey).toBeDefined();
      expect(data.storageKey).toContain(testOrgId);
      expect(data.mimeType).toBe("application/pdf");
      expect(data.sizeBytes).toBe(testContent.length);

      // Verify the file was stored directly in PostgreSQL stored_files simulation
      const stored = mockFileTable.get(data.storageKey);
      expect(stored).toBeDefined();
      expect(stored.data.equals(testContent)).toBe(true);

      // Verify immediate retrieval via /files/* (Caddy stripped streaming route)
      const fetchRes = await app.inject({
        method: "GET",
        url: `/files/${encodeURIComponent(data.storageKey)}`,
      });
      expect(fetchRes.statusCode).toBe(200);
      expect(fetchRes.headers["content-type"]).toBe("application/pdf");
      expect(fetchRes.rawPayload.equals(testContent)).toBe(true);
    });

    it("successfully uploads file via /api/upload (direct route) and persists directly in DB stored_files", async () => {
      const boundary = "---------------------------boundary789";
      const filePayload = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="direct.pdf"',
        "Content-Type: application/pdf",
        "",
        testContent.toString(),
        `--${boundary}--`,
        "",
      ].join("\r\n");

      const res = await app.inject({
        method: "POST",
        url: "/api/upload",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "x-org-id": testOrgId,
        },
        payload: filePayload,
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.ok).toBe(true);
      expect(data.storageKey).toBeDefined();

      // Verify retrieval via /api/files/* (unstripped streaming route)
      const fetchRes = await app.inject({
        method: "GET",
        url: `/api/files/${encodeURIComponent(data.storageKey)}`,
      });
      expect(fetchRes.statusCode).toBe(200);
      expect(fetchRes.headers["content-type"]).toBe("application/pdf");
      expect(fetchRes.rawPayload.equals(testContent)).toBe(true);
    });
  });
});
