class RoomManager {
  constructor() {
    this.users = {};
    this.socketToRoom = {};
  }

  joinFirstSocketRoomWithMediaStream(roomId, socketId, stream) {
    this.users[roomId] = [{
        id: socketId,
        stream: stream,
      }];
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

  getOtherUsersInRoom (socketID, roomID) {
    let allUsers = [];
  
    if (!this.users[roomID]) return allUsers;
  
    allUsers = this.users[roomID]
      .filter((user) => user.id !== socketID)
      .map((otherUser) => ({ id: otherUser.id }));
  
    return allUsers;
  };

  deleteUser (socketID, roomID) {
    if (!this.users[roomID]) return;

    this.users[roomID] = this.users[roomID].filter((user) => user.id !== socketID);

    if (this.users[roomID].length === 0) {
      delete this.users[roomID];
    } else {
      delete this.socketToRoom[socketID];
    }
  };
}

module.exports = RoomManager;