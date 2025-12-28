import { Controller, Get } from "@nestjs/common";
import { RythmsService } from "./rythms.service";

@Controller("rythms")
export class RythmsController {
  constructor(private readonly rythmsService: RythmsService) {}

  /**
   * GET /rythms
   * Επιστρέφει όλους τους ρυθμούς με πλήθος τραγουδιών
   */
  @Get()
  async getAllRythms() {
    return this.rythmsService.findAll();
  }
}
