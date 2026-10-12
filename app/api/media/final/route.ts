import { getOwnedFinalVideo } from "@/lib/final-render/server";
import { unstable_rethrow } from "next/navigation";
export async function GET(request:Request){
  const headers={"Cache-Control":"private, no-store",Vary:"Cookie"};
  try{
    const video=await getOwnedFinalVideo(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(video?{video}:{code:"NOT_FOUND"},{status:video?200:404,headers});
  }catch(error){unstable_rethrow(error);return Response.json({code:"UNAVAILABLE"},{status:503,headers});}
}
