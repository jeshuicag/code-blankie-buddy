import { createFileRoute } from "@tanstack/react-router";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const Route = createFileRoute("/api/public/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData();
        const picture = formData.get("picture");

        if (!(picture instanceof File)) {
          return new Response("Missing picture file", { status: 400 });
        }
        if (!picture.type.startsWith("image/")) {
          return new Response("Only image files are allowed", { status: 415 });
        }
        if (picture.size > MAX_SIZE_BYTES) {
          return new Response("Picture is too large (max 10 MB)", {
            status: 413,
          });
        }

        // Store the picture in the server's temporary directory.
        // Note: this runtime is ephemeral — for permanent storage, connect
        // Lovable Cloud and save files to Storage instead.
        const safeName = picture.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filename = `${Date.now()}-${safeName}`;
        const dir = "/tmp/uploads";
        await mkdir(dir, { recursive: true });
        const buffer = Buffer.from(await picture.arrayBuffer());
        await writeFile(join(dir, filename), buffer);

        return Response.json({
          filename,
          size: picture.size,
          type: picture.type,
        });
      },
    },
  },
});
