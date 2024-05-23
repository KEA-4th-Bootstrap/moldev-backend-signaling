import PeerConnectionManager from './peer';
import RoomManager from './room';
import { createClient } from 'redis';
import config from './config';
import { isIncluded } from './utils';
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

const room = new RoomManager(new Redis());
const peer = new PeerConnectionManager();

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
        const allUsers = room.getOtherUsersInRoom(data.id, data.roomId);
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
        room.socketToRoom[socketId] = roomId;
        const pc = new wrtc.RTCPeerConnection(config.PC_CONFIG);
  
        if (peer.receiverPCs[socketId]) {
          peer.joinReceiverPC(socketId, pc);
        } else { 
          peer.joinFirstReceiverPC(socketId, pc);
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
          if (room.users[roomId]) {
            if (isIncluded(room.users[roomId], socketId))
              return;
            room.joinSocketRoomWithMediaStream(roomId, socketId, e.streams[0])
          } else {
            room.joinFirstSocketRoomWithMediaStream(roomId, socketId, e.streams[0], socket.id)
          }
          room.users[roomId].forEach (async user => {
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
        let pc = peer.receiverPCs[data.senderSocketId];
        console.log("sender candidate", new wrtc.RTCIceCandidate(data.candidate));
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

      if(receiverSocketId === null || senderSocketId === null || roomId === null || receiverSocketId === undefined || senderSocketId === undefined || roomId === undefined)
        return;

      try {
        const pc = new wrtc.RTCPeerConnection(config.PC_CONFIG);

        if (peer.senderPCs[senderSocketId]) {
          peer.joinSenderPC(senderSocketId, receiverSocketId, pc);
        } else {
          peer.joinFirstSenderPC(senderSocketId, receiverSocketId, pc);
        }

        const sendUser = room.getSenderUser(roomId, senderSocketId);
        await sendUser.stream.getTracks().forEach((track) => {
          pc.addTrack(track, sendUser.stream);
        });

        await pc.setRemoteDescription(data.sdp).then(() => {
          pc.createAnswer({ offerToReceiveAudio: false, offerToReceiveVideo: false }).then((sdp) => {
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
      const receiverSocketId = data.receiverSocketId;
      const senderSocketId = data.senderSocketId;
      const candidate = data.candidate;

      console.log("data", data);

      if(receiverSocketId === null || senderSocketId === null || candidate === null || receiverSocketId === undefined || senderSocketId === undefined || candidate === undefined)
        return;

      try {
        const senderPC = peer.senderPCs[senderSocketId].filter((sPC) => sPC.id === receiverSocketId)[0];
        console.log(new wrtc.RTCIceCandidate(candidate));
        await senderPC.pc.addIceCandidate(new wrtc.RTCIceCandidate(candidate));

        console.log("remote onicecandidate start");
        senderPC.onicecandidate = async (e) => {
          console.log("remote onicecandidate ing");
          await this.sendDataCallback(receiverSocketId, {
            id: senderSocketId,
            candidate: e.candidate
          }, "getReceiverCandidate");
        };
        console.log("remote onicecandidate end");

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
        let roomId = room.socketToRoom[channel];

        if (roomId === null) return;
  
        room.deleteUser(channel, roomId);
        peer.closeReceiverPC(channel);
        peer.closeSenderPCs(channel);

        if (room.users[roomId] === undefined) return;

        console.log("room.users", room.users)

        room.users[roomId].forEach (user => {
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