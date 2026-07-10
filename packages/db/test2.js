const { db } = require('./dist/client.js');
const { facilityRequests, facilitySpaces, users } = require('./dist/schema/index.js');
const { eq, and, desc } = require('drizzle-orm');
async function run() {
  try {
    const query = db
          .select({
            id: facilityRequests.id,
            type: facilityRequests.type,
            title: facilityRequests.title,
            description: facilityRequests.description,
            status: facilityRequests.status,
            createdAt: facilityRequests.createdAt,
            requesterId: facilityRequests.requesterId,
            spaceId: facilityRequests.spaceId,
            building: facilitySpaces.building,
            floor: facilitySpaces.floor,
            spaceName: facilitySpaces.name,
            submittedBy: users.name,
          })
          .from(facilityRequests)
          .leftJoin(facilitySpaces, eq(facilityRequests.spaceId, facilitySpaces.id))
          .leftJoin(users, eq(facilityRequests.requesterId, users.id))
          .orderBy(desc(facilityRequests.createdAt))
          .limit(50);
          
    const res = await query;
    console.log("Success", res.length);
  } catch(e) {
    console.error("Error", e);
  }
  process.exit(0);
}
run();
