"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Monitor,
  Code2,
  KeyRound,
  Building2,
  Users,
  HelpCircle,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";

type Category = {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  tags: string[];
};

const CATEGORIES: Category[] = [
  {
    id: "hardware",
    label: "IT Hardware",
    description: "Laptop, monitor, keyboard, mouse, peripherals",
    icon: Monitor,
    color: "border-blue-200 bg-blue-50 hover:bg-blue-100",
    tags: ["hardware"],
  },
  {
    id: "software",
    label: "Software",
    description: "Install software, license request, updates",
    icon: Code2,
    color: "border-purple-200 bg-purple-50 hover:bg-purple-100",
    tags: ["software"],
  },
  {
    id: "access",
    label: "Access & Accounts",
    description: "System access, password reset, permissions",
    icon: KeyRound,
    color: "border-green-200 bg-green-50 hover:bg-green-100",
    tags: ["access"],
  },
  {
    id: "facilities",
    label: "Facilities",
    description: "Desk, room, equipment, building access",
    icon: Building2,
    color: "border-yellow-200 bg-yellow-50 hover:bg-yellow-100",
    tags: ["facilities"],
  },
  {
    id: "hr",
    label: "HR Services",
    description: "Onboarding, offboarding, policy questions",
    icon: Users,
    color: "border-pink-200 bg-pink-50 hover:bg-pink-100",
    tags: ["hr"],
  },
  {
    id: "other",
    label: "Other",
    description: "Something else not listed above",
    icon: HelpCircle,
    color: "border-gray-200 bg-gray-50 hover:bg-gray-100",
    tags: [],
  },
];

const PRIORITIES = [
  { value: "Low", label: "Low — not urgent, can wait" },
  { value: "Medium", label: "Medium — needed soon" },
  { value: "High", label: "High — impacting my work" },
  { value: "Critical", label: "Critical — completely blocked" },
];

type SubmittedTicket = { number: string; id: string };

export default function NewRequestPage() {
  const router = useRouter();
  const [category, setCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [submitted, setSubmitted] = useState<SubmittedTicket | null>(null);

  const { data: priorityList } = trpc.tickets.listPriorities.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const create = trpc.tickets.create.useMutation({
    onSuccess: (ticket) => {
      setSubmitted({ number: (ticket as any).number, id: (ticket as any).id });
      toast.success("Request submitted successfully!");
    },
    onError: (err) => toast.error(err?.message ?? "Failed to submit request. Please try again."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a title for your request.");
      return;
    }

    const resolvedPriorityId = priorityList?.find(
      (p) => p.name.toLowerCase() === priority.toLowerCase(),
    )?.id;

    create.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      type: "request",
      priorityId: resolvedPriorityId,
      tags: category?.tags ?? [],
    });
  }

  // Success screen
  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Request Submitted!</h2>
          <p className="mt-1 text-sm text-gray-500">
            Your request has been created and our team will be in touch shortly.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-4 py-1.5 font-mono text-sm font-semibold text-blue-700">
            Ticket #{submitted.number}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/portal/requests"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <ClipboardList className="h-4 w-4" />
            View My Requests
          </Link>
          <button
            onClick={() => {
              setSubmitted(null);
              setCategory(null);
              setTitle("");
              setDescription("");
              setPriority("Medium");
            }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (category ? setCategory(null) : router.back())}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {category ? "Back to categories" : "Back"}
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-xs text-gray-500">New Request</span>
        {category && (
          <>
            <span className="text-gray-300">/</span>
            <span className="text-xs text-gray-700 font-medium">{category.label}</span>
          </>
        )}
      </div>

      <div>
        <h1 className="text-lg font-bold text-gray-900">
          {category ? `${category.label} Request` : "What do you need help with?"}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {category
            ? "Fill in the details below and we'll get back to you as soon as possible."
            : "Select a category to get started."}
        </p>
      </div>

      {/* Step 1: Category selection */}
      {!category && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat)}
              className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${cat.color}`}
            >
              <cat.icon className="h-6 w-6 text-gray-700" />
              <div>
                <p className="text-sm font-semibold text-gray-800">{cat.label}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">{cat.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Request form */}
      {category && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Category badge */}
          <div className="flex items-center gap-2">
            <category.icon className="h-4 w-4 text-gray-500" />
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
              {category.label}
            </span>
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700" htmlFor="request-title">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="request-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary of your request"
              maxLength={200}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700" htmlFor="request-desc">
              Description
            </label>
            <textarea
              id="request-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide more details about what you need or what's going wrong…"
              rows={5}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Priority */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Priority</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    priority === p.value
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="block font-semibold">{p.value}</span>
                  <span className="mt-0.5 block text-[10px] opacity-70 leading-tight">
                    {p.label.split(" — ")[1]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={create.isPending || !title.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Submit Request
            </button>
            <button
              type="button"
              onClick={() => router.push("/portal")}
              className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
