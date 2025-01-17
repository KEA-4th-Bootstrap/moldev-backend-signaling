import dotenv from 'dotenv';
dotenv.config();

module.exports = {
  SERVER_PORT: process.env.SERVER_PORT,
  PC_CONFIG: {
    iceServers: [
      {
          urls: process.env.STUN_URL,
      },
      {
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDETIAL,
      },
      {
        urls: process.env.TURN_URL,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDETIAL,
      },
    ]
  },
  SOCKET_SERVER_URL: process.env.SOCKET_SERVER_URL,
  CORS_CONFIG: {
    cors: {
        origin: [process.env.CLIENT_URL, "https://web.moldev.site"],
        methods: ["GET", "POST"],
        transports: ['websocket', 'polling'],
        credentials: true                 
    },
    allowEIO3: true
  },
  REDIS_URL: {
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
  }
};
