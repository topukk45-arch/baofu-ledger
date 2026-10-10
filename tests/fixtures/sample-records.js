// 回归对比用的假账单：2026 年 8、9 月，约 150 条，全部虚构。
// 用固定种子的伪随机数生成，每次生成的内容完全一样，所以新旧两个版本拿到的是同一份数据。
// 只模拟「真实账本的形状」（分类分布、金额量级、同一天多笔、备注有无），不含任何真实数据。
function rng(seed){ return ()=>{ seed=(seed*1103515245+12345)%2147483648; return seed/2147483648; }; }
const R=rng(20261010);
const pick=a=>a[Math.floor(R()*a.length)];
const CATS={
  '餐饮':{ remarks:['早饭','午饭','晚饭','夜宵','咖啡','奶茶',''], min:5, max:60 },
  '购物':{ remarks:['超市','日用品','衣服','网购',''], min:10, max:300 },
  '出行':{ remarks:['地铁','公交','打车','火车票',''], min:2, max:400 },
  '其他':{ remarks:['话费','视频会员','理发','游戏充值',''], min:5, max:200 },
};
const out=[]; let n=0;
const id=()=>'s'+String(n++).padStart(4,'0');
const two=x=>Math.round(x*100)/100;
for(const mo of ['08','09']){
  const days = mo==='08' ? 31 : 30;
  for(let d=1; d<=days; d++){
    const k = 1+Math.floor(R()*3);                    // 每天 1–3 笔支出
    for(let i=0;i<k;i++){
      const cat=pick(Object.keys(CATS)), c=CATS[cat];
      const hh=String(7+Math.floor(R()*15)).padStart(2,'0'), mi=String(Math.floor(R()*60)).padStart(2,'0');
      out.push({ id:id(), time:`2026-${mo}-${String(d).padStart(2,'0')}T${hh}:${mi}`, money:two(c.min+R()*(c.max-c.min)),
                 type:'expense', cat, remark:pick(c.remarks) });
    }
  }
  out.push({ id:id(), time:`2026-${mo}-10T09:00`, money:6000, type:'income', cat:'工资', remark:'工资' });
  out.push({ id:id(), time:`2026-${mo}-15T20:00`, money:two(50+R()*100), type:'income', cat:'红包', remark:'红包' });
}
module.exports=out;
