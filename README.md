# 🏓 Pong Online

Pong multijugador online con Node.js + Express + Socket.io. Crea una sala, comparte el código de 4 letras y juega desde cualquier navegador.

## Correr localmente

```bash
npm install
npm start
```

Abre `http://localhost:3000` en dos pestañas (o PC + teléfono en la misma red usando tu IP local).

## Deploy (gratis, soporta WebSockets)

**Render.com** (recomendado):
1. Sube este proyecto a GitHub.
2. En Render: *New → Web Service* → conecta el repo.
3. Build command: `npm install` · Start command: `npm start`
4. La variable `PORT` la asigna Render automáticamente.
5. Copia la URL pública y compártela.

Alternativas: Railway, Fly.io, Glitch. Todas soportan WebSockets.

## Controles

- **Jugador izquierda:** W / S (o flechas si es tu lado)
- **Jugador derecha:** Flechas ↑ / ↓
- **Móvil:** arrastra el dedo sobre el canvas

## Características

- Salas con código de 4 letras
- Servidor autoritativo (pelota sincronizada, sin trampas 😄)
- Marcador, primeros en 7 goles
- Revancha con un botón
- Chat pequeño dentro de la partida
- Mariposa 🦋 cada vez que alguien anota
- Responsive + táctil
