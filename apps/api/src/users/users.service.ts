import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import type { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getFullProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true, socialLinks: true },
    });
    if (!user) throw new ResourceNotFoundException("User not found");

    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  /**
   * §10 — organizer isn't a role; it's just "has created ≥1 event". Called
   * from EventsService when a user publishes their first draft (Phase 1).
   * Idempotent: only sets the timestamp once (§49 — free credits must not be
   * re-grantable via repeated activation).
   */
  async activateOrganizerIfNeeded(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizerActivatedAt: true },
    });
    if (!user || user.organizerActivatedAt) return false;

    await this.prisma.user.update({
      where: { id: userId },
      data: { organizerActivatedAt: new Date() },
    });
    return true;
  }
}
