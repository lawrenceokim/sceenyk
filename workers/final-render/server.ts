import { loadEnvConfig } from "@next/env";
import { createPreparationServer } from "../../lib/media-preparation/http";
import { workerSharedSecret } from "../../lib/media-preparation/auth";
import { registerWorkerRequest } from "../../lib/media-preparation/replay";
import { dispatchRender, drainRenderer } from "../../lib/final-render/worker";

loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {server,drain}=createPreparationServer(workerSharedSecret(),async()=>({ready:false}),registerWorkerRequest,undefined,undefined,dispatchRender);
process.once("SIGTERM",()=>{drain();void drainRenderer();setTimeout(()=>process.exit(1),290_000).unref();});
server.listen(Number(process.env.PORT??3013),process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1');
