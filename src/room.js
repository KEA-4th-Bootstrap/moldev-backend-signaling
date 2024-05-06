export class RoomManager {
  constructor(redis) {
    this.users = {};
    this.socketToRoom = {};
    this.redis = redis;
  }

  joinFirstSocketRoomWithMediaStream(roomId, socketId, stream, roomSocketId) {
    this.users[roomId] = [{
      id: socketId,
      stream: stream,
    }];
    this.redis.setAsync(`room:${roomId}`, roomSocketId);
  }

  joinSocketRoomWithMediaStream(roomId, socketId, stream) {
    this.users[roomId].push({
      id: socketId,
      stream: stream,
    });
  }

  getSenderUser(roomId, senderSocketId) {
    return this.users[roomId].filter((user) => user.id === senderSocketId)[0];
  }

  getOtherUsersInRoom (socketId, roomId) {
    let allUsers = [];

    if (!this.users[roomId]) return allUsers;
  
    allUsers = this.users[roomId]
      .filter((user) => user.id !== socketId)
      .map((otherUser) => ({ id: otherUser.id }));
  
    return allUsers;
  };

  deleteUser (socketId, roomId) {
    if (!this.users[roomId]) return;

    this.users[roomId] = this.users[roomId].filter((user) => user.id !== socketId);

    if (this.users[roomId].length === 0) {
      delete this.users[roomId];
      this.redis.delAsync(`room:${roomId}`);
    } else {
      delete this.socketToRoom[socketId];
    }
  };
}