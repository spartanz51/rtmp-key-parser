/*
 *   RTMP Interceptor - @Taigah @Spartanz51
 *   RTMP Spec source:
 *      https://wwwimages2.adobe.com/content/dam/acom/en/devnet/rtmp/pdf/rtmp_specification_1.0.pdf
 */

const net = require('net')
const { once } = require('events')
const fs = require('fs').promises

class RTMPInterceptor {
  constructor (listenPort) {
    this.listenPort = listenPort

    this.startService()
  }

  async startService() {
    /* 
     *  Load binaries replies
     */
    const hsr = Buffer.from(await fs.readFile(__dirname+'/chunks/handshake.bin'))
    const tcr = Buffer.from(await fs.readFile(__dirname+'/chunks/tcurl.bin'))
    const c3r = Buffer.from(await fs.readFile(__dirname+'/chunks/c3.bin'))
    const skr = Buffer.from(await fs.readFile(__dirname+'/chunks/skey.bin'))
    this.binaryChunks = {
      hsr: hsr,
      tcr: tcr,
      c3r: c3r,
      skr: skr
    }
    this.server = net.createServer(client => { this.onstream(client) })
    this.server.listen(this.listenPort)
  }

  async onstream(client) {
    let server = null
    this.bindClientEvents(client, server)

    const hs    = await this.handshake(client)          /* RTMP handshake */
    await client.write(this.binaryChunks.hsr)

    const tc    = await this.getTcUrl(client)           /* Intercept tcUrl */
    await client.write(this.binaryChunks.tcr)

    const c3    = await this.c3(client)                 /* Intercept chunk3 */
    await client.write(this.binaryChunks.c3r)

    const sk    = await this.getSKey(client, tc.tcUrl)  /* Intercept Stream Key */

    const payload = await this.ondata(client, tc.tcUrl, sk.streamKey)

    if(payload) {
      await client.write(this.binaryChunks.skr)         /* Send confirmation to the client */
      let tcChunks = tc.chunks
      let skChunks = sk.chunks
      if(payload.tcChunks){
        tcChunks = payload.tcChunks
      }
      if(payload.skChunks){
        skChunks = payload.skChunks
      }
      const chunks = hs.chunks
        .concat(tcChunks)
        .concat(c3.chunks)
        .concat(skChunks)
      server = await this.proxify(payload, chunks, client)
      this.bindServerEvents(client, server)
    }else{
      await client.destroy()
    }
  }

  bindClientEvents(client, server) {
    client.on('close', ()=>{
      client.destroy()
      if(server) {
        server.destroy()
      }
      if(client.onleave){
        client.onleave()
      }
    })
    client.on('error', ()=>{
      client.destroy()
      if(server) {
        server.destroy()
      }
    })
  }

  bindServerEvents(client, server) {
    server.on('close', () => {
      client.destroy()
      if(server) {
        server.destroy()
      }
    })
    server.on('error', err => {
      client.destroy()
      if(server) {
        server.destroy()
      }
    })
  }

  async handshake (client) {                            /* WARN: Doesn't verify handshake integrity */
    await once(client, 'readable')
    const c0 = await once(client, 'data')
    return {chunks: c0}
  }

  async c3 (client) {
    await once(client, 'readable')
    const c3 = await once(client, 'data')
    return {chunks: c3}
  }

  async getTcUrl (client) {
    let resultChunks = []
    let tcUrl
    await once(client, 'readable')
    let chunks = await once(client, 'data')

    while(!chunks.toString().replace(/[^\x20-\x7E]/g, '').includes('rtmp://')){
      for (const chunk of chunks) {        /* Send intercepted chunks */
        resultChunks.push(chunk)
      }
      chunks = await once(client, 'data')  /* Skip bad chunk */
    }
   
    for (const chunk of chunks) {
      const matches = chunk.toString().match(/rtmp[^\0]+/)
      if (tcUrl === undefined && matches) {
        tcUrl = matches[0].replace(/\s/g, '')
      }
    }
   
    if (tcUrl === undefined) {            /* Verify tcUrl */
      console.log('tcUrl not received')
      client.destroy()
      return
    }
    for (const chunk of chunks) {         /* Send intercepted chunks */
      resultChunks.push(chunk)
    }

    return {chunks: resultChunks, tcUrl: tcUrl}
  }

  async getSKey (client, tcUrl) {
    let resultChunks = []

    let chunks = await once(client, 'data')
    while(!chunks.toString().replace(/[^\x20-\x7E]/g, '').includes('publish')){
      for (const chunk of chunks) {           /* Send intercepted chunks */
        resultChunks.push(chunk)
      }
      chunks = await once(client, 'data')     /* Skip bad chunk */
    }

    let streamKey
    for (const chunk of chunks) {
      const matches = chunk.toString().replace(/[^\x20-\x7E]/g, '').match(/publish[@]{0,1}(.+)live/)
      if (matches) {
        streamKey = matches[1].replace(/\s/g, '')
      }
    }
  
    for (const chunk of chunks) {
      resultChunks.push(chunk)
    }

    return {chunks: resultChunks, streamKey: streamKey}
  }

  async proxify(payload, chunks, client) {
    const server = await net.createConnection(payload.port, payload.host)
    for (let c of chunks) {
      await server.write(c)
    }

    client.pipe(server)
    server.pipe(client)

    return server
  }

  async ondata() {}
}

function listen(payload, cb) {
  const r = new RTMPInterceptor(payload.listenPort)
  r.ondata = cb
}

module.exports = { listen }
