import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientErrorsController } from "./client-errors.controller";

@Module({ imports: [AuthModule], controllers: [ClientErrorsController] })
export class ClientErrorsModule {}
