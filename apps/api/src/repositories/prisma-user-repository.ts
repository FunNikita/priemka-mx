import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../generated/prisma/client.js";

import { autoEnrollDemoResident } from "../demo-auto-enroll.js";

import type { UserIdentity, UserRepository, UpsertMaxUserInput } from "./user-repository.js";

export class PrismaUserRepository implements UserRepository {
  readonly prisma: PrismaClient;

  constructor(private readonly demoAutoEnrollHouseAddress?: string) {
    const url = new URL(requiredEnv("DATABASE_URL"));
    this.prisma = new PrismaClient({
      adapter: new PrismaMariaDb({
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1),
        connectionLimit: 5,
      }),
    });
  }

  async isReady(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async upsertFromMax({ user, authDate, seenAt }: UpsertMaxUserInput): Promise<UserIdentity> {
    const data = {
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      languageCode: user.languageCode,
      photoUrl: user.photoUrl,
      lastAuthDate: new Date(authDate * 1000),
      lastSeenAt: seenAt,
    };
    const identity = await this.prisma.user.upsert({ where: { maxUserId: user.id }, create: { maxUserId: user.id, ...data }, update: data, select: { id: true, isAdmin: true } });
    await autoEnrollDemoResident(this.prisma, identity.id, this.demoAutoEnrollHouseAddress);
    return identity;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
