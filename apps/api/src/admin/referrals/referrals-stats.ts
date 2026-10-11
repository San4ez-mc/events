import type { PrismaService } from "../../prisma/prisma.service";

/** How the "share for credits" program is doing: images downloaded to share (30 d) and the claims queue. */
export async function referralStats(prisma: PrismaService) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [shareImages, pending, approved] = await Promise.all([
    prisma.eventAnalyticsEvent.count({ where: { action: "SHARE_IMAGE", createdAt: { gte: since } } }),
    prisma.referralSubmission.count({ where: { status: "PENDING" } }),
    prisma.referralSubmission.count({ where: { status: "APPROVED" } }),
  ]);
  return { shareImages30d: shareImages, claimsPending: pending, claimsApproved: approved };
}
