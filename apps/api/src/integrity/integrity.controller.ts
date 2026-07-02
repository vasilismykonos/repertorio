import { Body, Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { IntegrityService } from "./integrity.service";

@Controller("integrity")
export class IntegrityController {
  constructor(private readonly integrity: IntegrityService) {}

  @Get("summary")
  async summary(@Headers("x-internal-key") internalKey?: string) {
    this.assertInternalKey(internalKey);
    return this.integrity.summary();
  }

  @Post("repair")
  async repair(@Headers("x-internal-key") internalKey: string | undefined, @Body("action") action?: string) {
    this.assertInternalKey(internalKey);
    return this.integrity.repair(String(action || "").trim());
  }

  private assertInternalKey(internalKey?: string) {
    const expected = String(process.env.INTERNAL_API_KEY || "").trim();
    const got = String(internalKey || "").trim();
    if (!expected || got !== expected) {
      throw new UnauthorizedException("Invalid internal key");
    }
  }
}
