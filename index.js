/*
 *   RTMP Interceptor - @Taigah @Spartanz51
 *   RTMP Spec source:
 *      https://wwwimages2.adobe.com/content/dam/acom/en/devnet/rtmp/pdf/rtmp_specification_1.0.pdf
 */

const net = require('net')
const { once } = require('events')

class RTMPInterceptor {
  constructor (remoteHost, remotePort, listenPort) {
    this.remoteHost = remoteHost
    this.remotePort = remotePort
    this.listenPort = listenPort

    this.startService()
  }

  startService() {
    this.server = net.createServer(client => { this.onstream(client) })
    this.server.listen(this.listenPort)
  }

  async onstream(client) {
    const server = net.createConnection(this.remotePort, this.remoteHost)
    client.on('close', ()=>{
      this.onleave(client)
    })
    client.on('error', ()=>{
      console.log('client is closed')
    })
    server.on('close', () => console.log('server is closed'))
    server.on('error', err => {
      console.error('erreur terrible de connexion au serveur')
      console.error(err)
    })

    server.pipe(client)

    await this.handshake(client, server)                  /* RTMP handshake */
    const tcUrl = await this.getTCUrl(client, server)     /* Intercept TcURL */
    const c4    = await this.c4(client, server)           /* Intercept chunk4 (ignore & forward it) */
    const sKey  = await this.getSKey(client, server)      /* Intercept Stream Key */

    this.ondata(client, server, tcUrl, sKey)
    client.pipe(server)                                   /* Then pipe everything */
  }

  async handshake (client, server) {                      /* WARN: Doesn't verify handshake integrity */
    await once(client, 'readable')
    const c0 = client.read(1)
    server.write(c0)

    await once(client, 'readable')
    const c1 = client.read(1536)
    server.write(c1)
  
    await once(client, 'readable')
    const c2 = client.read(1536)
    server.write(c2)
  }

  async c4 (client, server) {
    const c4 = await once(client, 'data')
    for (const chunk of c4) {
      server.write(chunk)
    }
    return c4
  }

  async getTCUrl (client, server) {
    let tcURL
    await once(client, 'readable')
    const chunks = await once(client, 'data')
   
    for (const chunk of chunks) {
      const matches = chunk.toString().match(/rtmp[^\0]+/)
      if (tcURL === undefined && matches) {
        tcURL = matches[0]
      }
    }
   
    if (tcURL === undefined) {            /* Verify tcUrl */
      console.log('tcURL not received')
      client.destroy()
      server.destroy()
      return
    }
    for (const chunk of chunks) {         /* Send intercepted chunks */
      server.write(chunk)
    }

    return tcURL
  }

  async getSKey (client, server) {
    const c5 = await once(client, 'data') 
    let streamKey
    for (const chunk of c5) {
      const matches = chunk.toString().replace(/[^\x20-\x7E]/g, '').match(/publish\@(.+)live/)
      if (matches) {
        streamKey = matches[1]
      }
    }
  
    for (const chunk of c5) {
      server.write(chunk)
    }
  
    server.write(c5[0])
    return streamKey
  }

  async onleave() {
    console.log('leave')
  }

  async ondata() {}
}

function listen(payload, cb) {
  const r = new RTMPInterceptor(payload.remoteHost, payload.remotePort, payload.listenPort)
  r.ondata = cb
}

module.exports = { listen }
