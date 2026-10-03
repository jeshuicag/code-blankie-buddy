import { createFileRoute } from "@tanstack/react-router";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB — Instagram's limit

const ZERNIO_BASE = "https://zernio.com/api/v1";

export const Route = createFileRoute("/api/public/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData();
        const picture = formData.get("picture");

        if (!(picture instanceof File)) {
          return new Response("Missing picture file", { status: 400 });
        }
        // Instagram only accepts JPEG and PNG.
        if (!["image/jpeg", "image/png"].includes(picture.type)) {
          return new Response("Only JPEG or PNG pictures can be posted to Instagram", {
            status: 415,
          });
        }
        if (picture.size > MAX_SIZE_BYTES) {
          return new Response("Picture is too large (max 8 MB)", {
            status: 413,
          });
        }

        const apiKey = process.env["ZERNIO_API_KEY"];
        if (!apiKey) {
          return new Response("Zernio API key is not configured", { status: 500 });
        }

        const buffer = Buffer.from(await picture.arrayBuffer());
        const authHeaders = {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        };

        try {
          // 1. Ask Zernio for a presigned upload URL.
          const presignRes = await fetch(`${ZERNIO_BASE}/media/presign`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              filename: picture.name || "photo.jpg",
              contentType: picture.type,
            }),
          });
          if (!presignRes.ok) {
            const detail = await presignRes.text();
            return new Response(`Zernio media upload failed: ${detail}`, {
              status: 422,
            });
          }
          const presign = (await presignRes.json()) as {
            uploadUrl: string;
            publicUrl: string;
          };

          // 2. Upload the picture bytes directly to that URL.
          const putRes = await fetch(presign.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": picture.type },
            body: new Uint8Array(buffer),
          });
          if (!putRes.ok) {
            const detail = await putRes.text();
            return new Response(`Zernio media upload failed: ${detail}`, {
              status: 422,
            });
          }

          // 3. Find the first connected Instagram account.
          const accountsRes = await fetch(`${ZERNIO_BASE}/accounts`, {
            headers: authHeaders,
          });
          if (!accountsRes.ok) {
            const detail = await accountsRes.text();
            return new Response(`Could not list Zernio accounts: ${detail}`, {
              status: 422,
            });
          }
          const { accounts } = (await accountsRes.json()) as {
            accounts: Array<{ _id: string; platform: string; isActive?: boolean }>;
          };
          const instagram = accounts.find(
            (a) => a.platform === "instagram" && a.isActive !== false
          );
          if (!instagram) {
            return new Response(
              "No Instagram account is connected to your Zernio account. Connect a Business or Creator account at zernio.com first.",
              { status: 409 }
            );
          }

          // 4. Publish the post to Instagram right away.
          const postRes = await fetch(`${ZERNIO_BASE}/posts`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              content: "",
              mediaItems: [{ type: "image", url: presign.publicUrl }],
              platforms: [{ platform: "instagram", accountId: instagram._id }],
              publishNow: true,
            }),
          });
          if (!postRes.ok) {
            const detail = await postRes.text();
            return new Response(`Zernio could not publish the post: ${detail}`, {
              status: 422,
            });
          }
          const post = (await postRes.json()) as { post?: { _id?: string } };

          // Also keep a local copy in the server's temporary directory.
          const safeName = picture.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filename = `${Date.now()}-${safeName}`;
          const dir = "/tmp/uploads";
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, filename), buffer);

          return Response.json({
            posted: true,
            instagramAccountId: instagram._id,
            zernioPostId: post.post?._id ?? null,
            filename,
            size: picture.size,
            type: picture.type,
          });
        } catch (err) {
          return new Response(
            `Unexpected error posting to Instagram: ${err instanceof Error ? err.message : String(err)}`,
            { status: 500 }
          );
        }
      },
    },
  },
});
