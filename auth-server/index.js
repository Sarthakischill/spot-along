// The final, corrected, dependency-free auth worker code

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        if (path === '/login') {
            const sessionId = url.searchParams.get('sessionId');
            if (!sessionId) {
                return new Response('Error: sessionId is required.', { status: 400 });
            }

            const scopes = 'user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-private';
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: env.SPOTIFY_CLIENT_ID,
                scope: scopes,
                redirect_uri: `${url.origin}/callback`,
                state: sessionId // Pass the sessionId to Spotify so it comes back to us
            });

            return Response.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`, 302);
        }

        if (path === '/callback') {
            const code = url.searchParams.get('code');
            const sessionId = url.searchParams.get('state'); // Get the sessionId back from Spotify

            if (!code || !sessionId) {
                return new Response('Error: Invalid callback from Spotify.', { status: 400 });
            }

            try {
                // Exchange the code for tokens
                const tokenUrl = "https://accounts.spotify.com/api/token";
                const credentials = `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`;
                const body = new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: `${url.origin}/callback`
                });

                const response = await fetch(tokenUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Basic ${btoa(credentials)}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: body.toString()
                });

                if (!response.ok) throw new Error('Failed to get token from Spotify.');

                const tokens = await response.json();

                // Store the tokens in the KV store with a 2-minute expiration
                await env.TOKEN_STORE.put(sessionId, JSON.stringify(tokens), { expirationTtl: 120 });

                // Show a simple success page
                const html = `<!DOCTYPE html><html lang="en"><head><title>Success!</title><style>body{font-family:sans-serif;background:#121212;color:white;display:flex;justify-content:center;align-items:center;height:100vh}div{text-align:center}h1{color:#1DB954}</style></head><body><div><h1>✅ Success!</h1><p>You have been authenticated. Please return to your terminal.</p><p style="color:#888">(This window will close automatically in a moment)</p></div><script>setTimeout(()=>window.close(),2000)</script></body></html>`;
                return new Response(html, { headers: { 'Content-Type': 'text/html' } });

            } catch (error) {
                return new Response(`Authentication failed: ${error.message}`, { status: 500 });
            }
        }
        
        // New endpoint for the CLI to poll
        if (path === '/check-token') {
            const sessionId = url.searchParams.get('sessionId');
            if (!sessionId) {
                return new Response('Error: sessionId is required.', { status: 400 });
            }

            const tokenString = await env.TOKEN_STORE.get(sessionId);

            if (!tokenString) {
                // Tokens are not ready yet, tell the CLI to keep polling
                return new Response(null, { status: 404 }); // Not Found
            }

            // Tokens found! Delete them so they can't be retrieved again.
            await env.TOKEN_STORE.delete(sessionId);
            
            // Send the tokens to the CLI
            return new Response(tokenString, { headers: { 'Content-Type': 'application/json' } });
        }

        return new Response('Not Found.', { status: 404 });
    },
};