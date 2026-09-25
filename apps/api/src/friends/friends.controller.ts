import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/types/authenticated-user";
import { FriendsService } from "./friends.service";
import { SendFriendRequestDto } from "./dto/send-friend-request.dto";
import { BlockUserDto } from "./dto/block-user.dto";
import { RateLimit } from "../common/throttle";

@ApiTags("friends")
@Controller("friends")
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  listFriends(@CurrentUser() user: AuthenticatedUser) {
    return this.friendsService.listFriends(user.id);
  }

  @Get("requests/incoming")
  listIncoming(@CurrentUser() user: AuthenticatedUser) {
    return this.friendsService.listIncomingRequests(user.id);
  }

  @Get("requests/outgoing")
  listOutgoing(@CurrentUser() user: AuthenticatedUser) {
    return this.friendsService.listOutgoingRequests(user.id);
  }

  @RateLimit(30)
  @Post("requests")
  sendRequest(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendFriendRequestDto) {
    return this.friendsService.sendRequest(user.id, dto.addresseeId);
  }

  @Patch("requests/:id/accept")
  accept(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.friendsService.accept(id, user.id);
  }

  @Patch("requests/:id/reject")
  reject(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.friendsService.reject(id, user.id);
  }

  @Patch("requests/:id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.friendsService.cancel(id, user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(":friendshipId")
  unfriend(@CurrentUser() user: AuthenticatedUser, @Param("friendshipId") friendshipId: string) {
    return this.friendsService.unfriend(friendshipId, user.id);
  }

  @Get("blocks")
  listBlocked(@CurrentUser() user: AuthenticatedUser) {
    return this.friendsService.listBlocked(user.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("blocks")
  block(@CurrentUser() user: AuthenticatedUser, @Body() dto: BlockUserDto) {
    return this.friendsService.block(user.id, dto.userId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete("blocks/:userId")
  unblock(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    return this.friendsService.unblock(user.id, userId);
  }

  @Get("status/:userId")
  async getStatus(@CurrentUser() user: AuthenticatedUser, @Param("userId") userId: string) {
    return { status: await this.friendsService.getRelationshipStatus(user.id, userId) };
  }
}
