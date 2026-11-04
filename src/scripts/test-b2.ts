import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { b2Client } from "../shared/storage/b2.client.ts";
import { env } from "../config/env.ts";

await b2Client.send(new HeadBucketCommand({ Bucket: env.B2_BUCKET }));
console.log("B2 connection OK");
