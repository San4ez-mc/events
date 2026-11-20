import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Event.paymentDetails (bank card / IBAN) is private: it is left out of every read by default, so no list, feed or
   * search can leak it. The few queries that may show it (organizer/collaborator edit, the event page for someone who is
   * registered) pass `omit: { paymentDetails: false }`.
   */
  constructor() {
    super({ omit: { event: { paymentDetails: true } } });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Connected to PostgreSQL");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Used by the /health/ready endpoint (§109). */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
