module.exports = {
  SERVER_PORT: 8080,
  PC_CONFIG: {
    iceServers: [
    // {
    //   urls: 'stun:[STUN_IP]:[PORT]',
    //   'credentials': '[YOR CREDENTIALS]',
    //   'username': '[USERNAME]'
    // },
      {
          urls: "stun:stun.l.google.com:19302",
      }]
  },
  SOCKET_SERVER_URL: "http://localhost:8080",
  CLIENT_URL: "http://localhost:3000",
  CORS_CONFIG: {
    cors: {
        origin: ["http://localhost:3000"],  
        methods: ["GET", "POST"],
        transports: ['websocket', 'polling'],
        credentials: true                 
    },
    allowEIO3: true
  }
};
