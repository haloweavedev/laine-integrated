import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOperatories } from "@/lib/nexhealth";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subdomain, locationId } = await req.json();

    if (!subdomain || !locationId) {
      return NextResponse.json({ error: "Subdomain and locationId required" }, { status: 400 });
    }

    const operatories = await getOperatories(subdomain, locationId);

    return NextResponse.json({ 
      success: true, 
      operatories 
    });

  } catch (error) {
    console.error("Error fetching operatories:", error);
    return NextResponse.json(
      { error: "Failed to fetch operatories" },
      { status: 500 }
    );
  }
} 