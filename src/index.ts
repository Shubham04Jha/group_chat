import { WebSocket, WebSocketServer } from "ws";
import {type Request, type Response} from 'express';
import express from "express";

const app = express();

interface ExtWebSocket extends WebSocket{
    isAuth: boolean;
    id: string;
    code: string;
}

const SocketMap: Map<string,Set<ExtWebSocket>> = new Map(); // key is the id and value is the socket.
const passwordCheck: Map<string,string> = new Map();

function generateCode(len: number): string {
    let id = '';
    do {
        const parts: string[] = [];
        for (let i = 0; i < len; i++) {
            parts.push(Math.floor(Math.random() * 10).toString());
        }
        id = parts.join('');
    } while (SocketMap.has(id));
    return id; 
}

app.get('/api/v1/makeRoom',(req: Request, res: Response): void =>{
    const id = generateCode(7);
    const code = generateCode(6);
    passwordCheck.set(id,code);
    SocketMap.set(id,new Set());
    res.json({id,code});
})


const server = app.listen(3000);
const wss = new WebSocketServer({server});

const verifyCredentials = (id: string|null, code: string|null): boolean =>{
    if(!id || !code) return false;
    return passwordCheck.has(id) && passwordCheck.get(id) === code;
}
wss.on('connection',(ws: ExtWebSocket)=>{
    const socket = ws as ExtWebSocket;
    socket.on('message',(message)=>{
        let data: any;
        try {
            data = JSON.parse(message.toString());
        } catch {
            socket.send('invalid JSON format');
            return;
        }
        if(!socket.isAuth){ // not authenticated then you want an authentication...
            if(data.type!='auth'){
                socket.send('first authenticate the socket');
            }
            else if(!SocketMap.has(data.id||'')){
                socket.send('room expired');
            }
            else if(!verifyCredentials(data.id||null,data.code||null)){
                socket.send('incorrect credentials');
            }else{
                // if id and code is verified lets add this socket in the map... and it will only exists when someone initialises it using the http make room
                SocketMap.get(data.id)?.add(socket);
                socket.id = data.id;
                socket.code = data.code;
                socket.isAuth = true;
            }
        }else{
            if(data.type=='auth'){
                socket.send('already authenticated');
            }else if(data.type!='message'){
                socket.send('invalid message type')
            }else{ // send the message in the whole group...
                SocketMap.get(socket.id)?.forEach(s => {
                    s.send(data.message||'__null__');
                });
            }
        }
    })
    socket.on('close',()=>{
        console.log('removing socket');
        const room = SocketMap.get(socket.id);
        if (room) {
            room.delete(socket);
            if (room.size === 0) {
                SocketMap.delete(socket.id);
                passwordCheck.delete(socket.id);
            }
        }
    })
})