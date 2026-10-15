import math, random
random.seed(7)
W, H = 64, 30                  # pixel grid (H must be even: 2 pixels per text row)
cx, cy = W/2, H/2
ew, eh = 26, 11                # eye half-width / half-height
BG = None
px = [[BG]*W for _ in range(H)]

def rgb(r,g,b): return (r,g,b)
# starfield
for _ in range(55):
    x, y = random.randrange(W), random.randrange(H)
    b = random.choice([90,130,180,240])
    px[y][x] = rgb(b,b,min(255,b+30))
# a few twinkle crosses
for (x,y) in [(5,4),(57,6),(10,25),(54,24)]:
    for dx,dy in [(0,0),(1,0),(-1,0),(0,1),(0,-1)]:
        px[y+dy][x+dx] = rgb(255,255,255) if (dx,dy)==(0,0) else rgb(150,160,210)

def lid(x):                    # almond eye shape
    t = (x-cx)/ew
    return eh*(1-t*t) if abs(t)<1 else -1

for y in range(H):
    for x in range(W):
        X, Y = x+0.5, y+0.5
        l = lid(X); d = abs(Y-cy)
        if l < 0: continue
        if d < l-1.2:
            r = math.hypot(X-cx, (Y-cy)*1.0)
            if r < 3.2:   c = rgb(5,5,12)                       # pupil
            elif r < 9.5:                                       # iris: amber -> red
                t = (r-3.2)/6.3
                c = rgb(255, int(200-150*t), int(40-30*t))
                if int(math.degrees(math.atan2(Y-cy,X-cx)))%30 < 6: # iris streaks
                    c = rgb(min(255,c[0]), min(255,c[1]+40), 60)
            elif r < 10.4: c = rgb(90,20,10)                    # iris ring
            else:                                               # sclera, shaded toward corners
                s = 1 - 0.35*abs(X-cx)/ew
                c = rgb(int(235*s), int(232*s), int(225*s))
            px[y][x] = c
        elif d < l+0.6:
            px[y][x] = rgb(70,190,255)                          # glowing lid outline
        elif d < l+1.6 and l > 2:
            px[y][x] = rgb(25,60,110)                           # soft glow
# glint
for (gx,gy) in [(int(cx)-3,int(cy)-3),(int(cx)-2,int(cy)-3),(int(cx)-3,int(cy)-2),(int(cx)+2,int(cy)+1)]:
    px[gy][gx] = rgb(255,255,255)

E = "\x1b["
out = []
for row in range(0, H, 2):
    line = ""
    for x in range(W):
        top, bot = px[row][x], px[row+1][x]
        if top is None and bot is None: line += E+"0m "
        elif bot is None: line += E+"0m"+E+"38;2;%d;%d;%dm▀" % top
        elif top is None: line += E+"0m"+E+"38;2;%d;%d;%dm▄" % bot
        else: line += E+"38;2;%d;%d;%dm" % top + E+"48;2;%d;%d;%dm▀" % bot
    out.append(line+E+"0m")
title = "C  Y  C  L  O  P  S     E  Y  E"
pad = (W-len(title))//2
out.append("")
out.append(" "*pad + E+"1;38;2;255;170;40m" + title + E+"0m")
out.append(" "*((W-27)//2) + E+"38;2;110;140;200m· · ·  the eye is open  · · ·" + E+"0m")
out.append("")
open("banner.txt","w").write("\n".join(out)+"\n")
