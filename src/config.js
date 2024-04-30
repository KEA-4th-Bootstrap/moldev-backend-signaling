import dotenv from 'dotenv';
dotenv.config();

module.exports = {
  SERVER_PORT: process.env.SERVER_PORT,
  PC_CONFIG: {
    iceServers: [
    // {
    //   urls: 'stun:[STUN_IP]:[PORT]',
    //   'credentials': '[YOR CREDENTIALS]',
    //   'username': '[USERNAME]'
    // },
      {
          urls: process.env.STUN_URL,
      }]
  },
  SOCKET_SERVER_URL: process.env.SOCKET_SERVER_URL,
  CORS_CONFIG: {
    cors: {
        origin: [process.env.CLIENT_URL],
        methods: ["GET", "POST"],
        transports: ['websocket', 'polling'],
        credentials: true                 
    },
    allowEIO3: true
  }
};
