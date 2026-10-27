(function(){
        const { PRESETS, DICT, HUES, MOD, LROW, CCOL, NEAR_DICT, NEAR_PRESET } = window.JiwenThemeData;   // 用到前面模块的
        // ===== 1027-UI：主色拆色、自己调的颜色起名（照搬 docs/design/theme-colors.html 的 themeNew / nameOf，不另起一套）=====
        //   themeNew(选的颜色) → { fill 按钮底色（就是选的颜色，不压深；字怎么配都不够 4.5:1 时才往反方向挪一点）,
        //     on 按钮上的字（同色相浅字 / 深字取对比高的，不到 4.5:1 往远处推）, ink 强调字（同色相，在页面底色和白卡上都 ≥ 4.5:1）,
        //     bg 页面底色（同色相、很浅很淡）, edge 按钮底色和页面底色对比 < 1.6（按钮要加一道强调字颜色的细边）, onC, nudged, mode }
        //   colorName(色值)（方案页的 nameOf，改名是因为 store.js 里已经有一个 nameOf）→ { name, verdict 短评, why, t }：预设同色 → 预设名；和词典几乎一样 → 词典名；挨着预设 → 「近」+ 预设名；
        //     都不像 → 深浅浓淡一个字 + 色相名。同一个色值永远同一个名字，不存、不调 AI。
        const hexToRgb=h=>{h=h.replace('#','');if(h.length===3)h=[...h].map(c=>c+c).join('');const n=parseInt(h,16);return{r:n>>16&255,g:n>>8&255,b:n&255}};
        const rgbToHex=(r,g,b)=>'#'+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
        const lum=hex=>{const{r,g,b}=hexToRgb(hex);const a=[r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*a[0]+.7152*a[1]+.0722*a[2]};
        const con=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
        function oklab(hex){const{r,g,b}=hexToRgb(hex);const f=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)};const R=f(r),G=f(g),B=f(b);
            const l=Math.cbrt(.4122214708*R+.5363325363*G+.0514459929*B),m=Math.cbrt(.2119034982*R+.6806995451*G+.1073969566*B),s=Math.cbrt(.0883024619*R+.2817188376*G+.6299787005*B);
            return[.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s]}
        function oklch(hex){const[L,A,B]=oklab(hex);let H=Math.atan2(B,A)*180/Math.PI;if(H<0)H+=360;return{L,C:Math.hypot(A,B),H}}
        function ok2hex(L,C,H){const a=C*Math.cos(H*Math.PI/180),b=C*Math.sin(H*Math.PI/180);
            const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
            const R=4.0767416621*l-3.3077115913*m+.2309699292*s,G=-1.2684380046*l+2.6097574011*m-.3413193965*s,B=-.0041960863*l-.7034186147*m+1.707614701*s;
            const g=v=>255*(v<=.0031308?12.92*v:1.055*Math.pow(Math.max(v,0),1/2.4)-.055);return rgbToHex(g(R),g(G),g(B))}
        const dE=(a,b)=>{const x=oklab(a),y=oklab(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])};

        // 拆色：一个颜色 → 底色、按钮字、页面底、强调字（方案页原样）
        function themeNew(fill){
            let{L,C,H}=oklch(fill);
            const bg=ok2hex(.975,Math.min(C,.018),H);
            const paleF=l=>ok2hex(l,Math.min(C,.02)*(1-(l-.97)/.03*.5),H), deepF=l=>ok2hex(l,Math.min(C,.05),H);
            let pl=.97,dl=.28;const pale=paleF(pl),deep=deepF(dl);
            const usePale=con(fill,pale)>=con(fill,deep);let on=usePale?pale:deep,g=0;
            while(con(fill,on)<4.5&&g++<20){if(usePale){pl=Math.min(1,pl+.005);on=paleF(pl)}else{dl-=.01;on=deepF(dl)}}
            let f=fill,nudged=false;g=0;
            while(con(f,on)<4.5&&g++<40){L+=usePale?-.01:.01;f=ok2hex(L,C,H);nudged=true}
            let il=Math.min(.48,L),ink=ok2hex(il,Math.min(C,.09),H);g=0;
            while((con(ink,bg)<4.5||con(ink,'#ffffff')<4.5)&&g++<40){il-=.01;ink=ok2hex(il,Math.min(C,.09),H)}
            return{fill:f,on,bg,ink,onC:con(f,on),nudged,edge:con(f,bg)<1.6,mode:usePale?'浅字':'深字'};
        }

        const PLIST=PRESETS.map(x=>({name:x.name,hex:x.color})), DLIST=DICT.map(x=>({name:x[0],hex:x[1]}));
        function nearest(list,p){let best=null,d=9;for(const x of list){const e=dE(p,x.hex);if(e<d){d=e;best=x}}return{best,d}}
        const nameCache=new Map();   // 拖选色条时一帧算一次，同一个色值不重算
        function colorName(hex){
            hex=String(hex||'').toLowerCase();
            if(nameCache.has(hex)) return nameCache.get(hex);
            const r=colorName0(hex);
            if(nameCache.size>500) nameCache.clear();
            nameCache.set(hex, r);
            return r;
        }
        function colorName0(hex){
            const t=themeNew(hex),p=t.fill,{L,C,H}=oklch(p);
            const li=L<.45?0:L<.65?1:2,ci=C<.045?0:C<.10?1:2,neutral=C<.025,warm=(H>=40&&H<120);
            const temp=neutral?'中性':(H<100||H>=330)?'暖调':(H<160)?'不冷不暖':'冷调';
            const verdict=`${temp} · ${CCOL[ci]} · ${LROW[li]} · 按钮配${t.mode} ${t.onC.toFixed(1)}:1`;
            const ex=PLIST.find(x=>x.hex.toLowerCase()===hex.toLowerCase());
            if(ex)return{t,verdict,name:ex.name,why:`预设「${ex.name}」。`,preset:true};
            const nd=nearest(DLIST,p),np=nearest(PLIST,p);
            if(nd.d<NEAR_DICT&&nd.d<=np.d)return{t,verdict,name:nd.best.name,why:`最像词典里的「${nd.best.name}」（${nd.best.hex}）。`};
            if(np.d<NEAR_PRESET)return{t,verdict,name:'近'+np.best.name,why:`挨着预设「${np.best.name}」（${np.best.hex}），所以叫「近${np.best.name}」。`};
            const base=neutral?(warm?'沙灰':'岩灰'):HUES[Math.floor(H/15)%24];
            let[m,alt]=MOD[li][ci],name=m+base;if(PLIST.some(x=>x.name===name)||DLIST.some(x=>x.name===name))name=alt+base;
            return{t,verdict,name,why:`按规则拼：「${name[0]}」是${LROW[li]}、${CCOL[ci]}；「${base}」来自${neutral?(warm?'偏暖的灰':'偏冷的灰'):'色相 '+Math.round(H)+'°'}。`};
        }
        window.JiwenTheme = { themeNew, colorName, con, oklch, ok2hex, dE };   // theme 模块对外只有这一个入口
})();
