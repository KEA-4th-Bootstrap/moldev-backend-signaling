import PeerConnectionManager from './peer'
import RoomManager from './room'
import { createClient } from 'redis';
import config from './config'
import { isIncluded } from './utils'
let wrtc = require("wrtc");

export class Redis {
  constructor() {
     this.redisClient = createClient(config.REDIS_URL);

     this.redisClient.on('connect', () => {
        console.info('Redis PubSub connected!');
     });

     this.redisClient.on('error', (err) => {
        console.error('Redis PubSub Client Error', err);
     });

     this.redisClient.connect().then();
  }

  async getAsync(key) {
    try {
      const json = await this.redisClient.get(key);
      return JSON.parse(json);
    } catch(error) {
      console.error(error);
      return null;
    }
  }

  async setAsync(key, data) {
    try {
      const value = JSON.stringify(data);
      await this.redisClient.set(key, value);
    } catch(error) {
      console.log(error);
      return null;
    }
  }

  async delAsync(key) {
    try {
      this.redisClient.del(key);
    } catch(error) {
      console.log(error);
      return null;
    }
  }
}

// const room = new RoomManager(new Redis());
// const peer = new PeerConnectionManager(room);

export class Publish extends Redis {
  constructor() {
    super();
  }

  async publish(channel, message) {
    try {
      await this.redisClient.publish(channel, message);
    } catch(e) {

    }
  }
}

export class Subscribe extends Redis {
  constructor(io, socket) {
    super();
    this.io = io;
    this.socket = socket;
    this.pub = new Publish();
    this.room = new RoomManager(new Redis());
    this.peer = new PeerConnectionManager(this.oom);
  }

  createPubData = (topic, data) => {
    return JSON.stringify({
      topic: topic,
      data: data,
    });
  }

  sendDataCallback = async (id, data, dataType) => {
    const sendData = this.createPubData(dataType, data);
    await this.pub.publish(id, sendData);
  };

  async subscribeSendInfoUsingIo(channel) {
    await this.redisClient.subscribe(channel, (message) => {
      try {
        const data = JSON.parse(message);
        this.io.to(channel).emit(data.topic, data.data);
      } catch(error) {
        console.error(error);
      }
    });
  };
  
  async subscribeJoinRoom(channel) {
    await this.redisClient.subscribe(channel + "-joinRoom", async (message) => {
      const data = JSON.parse(message);
      try {
        const allUsers = this.room.getOtherUsersInRoom(data.id, data.roomId);
        await this.sendDataCallback(data.id, { users: allUsers }, "allUsers");
      } catch (error) {
        console.error(error);
      }
    });
  }

  
  async subscribeSenderOffer(channel, socket) {
    await this.redisClient.subscribe(channel + "-senderOffer", async (message) => {
      const data = JSON.parse(message);
      const socketId = data.senderSocketId;
      const roomId = data.roomId;

      try {
        this.room.socketToRoom[socketId] = roomId;
        const pc = new wrtc.RTCPeerConnection(config.PC_CONFIG);
  
        if (this.peer.receiverPCs[socketId]) {
          this.peer.joinReceiverPC(socketId, pc);
        } else { 
          this.peer.joinFirstReceiverPC(socketId, pc);
        }

        pc.setRemoteDescription(data.sdp).then(() => {
          pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true}).then((sdp) => {
            pc.setLocalDescription(sdp).then(() => {
              this.sendDataCallback(socketId, { sdp }, "getSenderAnswer");
            })
          })
        });

        pc.onicecandidate = (e) => {
          this.sendDataCallback(socketId, {candidate: e.candidate}, "getSenderCandidate");
        };

        pc.onicegatheringstatechange = (e) => {
          console.log("Ice gathering:" + JSON.stringify(e));
        };

        pc.oniceconnectionstatechange = (e) => {
          console.log("oniceconnectionstatechange", e);
        };

        pc.ontrack = (e) => {
          if (this.room.users[roomId]) {
            if (isIncluded(this.room.users[roomId], socketId))
              return;
            this.room.joinSocketRoomWithMediaStream(roomId, socketId, e.streams[0])
          } else {
            this.room.joinFirstSocketRoomWithMediaStream(roomId, socketId, e.streams[0], socket.id)
          }
          this.room.users[roomId].forEach (async user => {
              await this.sendDataCallback(user.id, { id: socketId, roomId: roomId }, "userEnter");
          });
        };
      } catch (error) {
        console.error("Error in subscription handler:", error);
      }
    });
  }

  async subscribeSenderCandidate(channel) {
    await this.redisClient.subscribe(channel + "-senderCandidate", async (message, channel) => {
      const data = JSON.parse(message);
      try {
        let pc = this.peer.receiverPCs[data.senderSocketId];
        await pc.addIceCandidate(new wrtc.RTCIceCandidate(data.candidate));
      } catch (error) {
        console.error(error);
      }
    });
  }

  async subscribeReceiverOffer(channel) {
    await this.redisClient.subscribe(channel + "-receiverOffer", async (message) => {
      const data = JSON.parse(message);
      const receiverSocketId = data.receiverSocketId;
      const senderSocketId = data.senderSocketId;
      const roomId = data.roomId;

      try {
        const pc = new wrtc.RTCPeerConnection(config.PC_CONFIG);

        if (this.peer.senderPCs[senderSocketId]) {
          this.peer.joinSenderPC(senderSocketId, receiverSocketId, pc);
        } else {
          this.peer.joinFirstSenderPC(senderSocketId, receiverSocketId, pc);
        }

        const sendUser = this.room.getSenderUser(roomId, senderSocketId);
        await sendUser.stream.getTracks().forEach((track) => {
          pc.addTrack(track, sendUser.stream);
        });

        await pc.setRemoteDescription(data.sdp).then(() => {
          pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true }).then((sdp) => {
            pc.setLocalDescription(sdp).then(() => {
              this.sendDataCallback(receiverSocketId, {id: senderSocketId, sdp}, "getReceiverAnswer");
            })
          })
        });

      } catch (error) {
        console.error(error);
      }
    });
  }


  async subscribeReceiverCandidate(channel) {
    await this.redisClient.subscribe(channel + "-receiverCandidate", async (message, channel) => {
      const data = JSON.parse(message);
      try {
        const senderPC = this.peer.senderPCs[data.senderSocketId].filter((sPC) => sPC.id === data.receiverSocketId)[0];
        await senderPC.pc.addIceCandidate(
          new wrtc.RTCIceCandidate(data.candidate)
        );

        senderPC.onicecandidate = async (e) => {
          await this.sendDataCallback(receiverSocketId, {
            id: senderSocketId,
            candidate: e.candidate
          }, "getReceiverCandidate");
        }; 

        senderPC.oniceconnectionstatechange = (e) => {
          console.log("oniceconnectionstatechange", e);
        };
      } catch (error) {
        console.error(error);
      }
    });
  }

  async subscribeDisconnect(channel) {
    await this.redisClient.subscribe(channel + "-disconnect", async (message) => {
      try {
        let roomId = this.room.socketToRoom[channel];

        if (roomId === null) return;
  
        this.room.deleteUser(channel, roomId);
        this.peer.closeReceiverPC(channel);
        this.peer.closeSenderPCs(channel);

        if (room.users[roomId] === undefined) return;

        console.log("room.users", room.users)

        this.room.users[roomId].forEach (user => {
          this.sendDataCallback(user.id, { id: channel, roomId: roomId }, "userExit");
        });
      } catch (error) {
        console.error(error);
      }
    });
  }

  async unsubscribe(channel) {
     await this.redisClient.unsubscribe(channel);
  }
}