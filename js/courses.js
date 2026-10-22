/* courses.js — 课程数据（参照《孩子们的拜厄》上下册、《钢琴基础教程（修订版）》、
 * 《孩子们的哈农》三套教材的教学体系组织，知识点为原创整理，不含教材曲谱）
 * 每课：{ id, line, book, title, icon, points:[{title,html}], staffDemo, practice }
 * line: 'baier' | 'jichu' | 'hanon'
 */
(function (global) {
  'use strict';

  var JICHU_COURSES = [
    {
      id: 'jichu-01', line: 'jichu', book: '第一册 · 入门', title: '认识五线谱与谱号', icon: '🎼',
      points: [
        { title: '五线谱', html: '<p>五线谱有 <b>五条线、四个间</b>，从下往上数：第一线、第二线……第五线。音符放在线上或间里，位置越高，音越高。</p>' },
        { title: '高音谱号（G 谱号）', html: '<p>高音谱号从<b>第二线</b>开始画，告诉你第二线就是 <b>G</b> 音。右手通常用高音谱号。</p>' },
        { title: '低音谱号（F 谱号）', html: '<p>低音谱号的两个点<b>夹住第四线</b>，告诉你第四线就是 <b>F</b> 音。左手通常用低音谱号。</p>' },
        { title: '弹琴先看谱号', html: '<p>同样的位置，换一个谱号就是完全不同的音。所以拿到谱子<b>第一件事是看谱号</b>！</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65, 67], caption: '高音谱号：下加一线 C4 开始往上' },
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'jichu-02', line: 'jichu', book: '第一册 · 入门', title: '高音谱号的音（一）', icon: '🎵',
      points: [
        { title: '中央 C', html: '<p>钢琴正中间的 <b>中央 C（C4）</b>，在高音谱号上画在<b>下加一线</b>。它是我们识谱的起点。</p>' },
        { title: '从 C 往上数', html: '<p>下加一线是 C，往上是：D（下加一间）、E（第一线）、F（第一间）、G（第二线）。</p>' },
        { title: '记住口诀', html: '<p>“一线 <b>E</b>、二线 <b>G</b>、三线 <b>B</b>”。高音谱号的第二线就是 G——谱号自己都写在那里啦。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65, 67], caption: 'C D E F G：从下加一线往上' },
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'jichu-03', line: 'jichu', book: '第一册 · 入门', title: '高音谱号的音（二）', icon: '🎯',
      points: [
        { title: '继续向上', html: '<p>第二线 G 再往上：A（第二间）、B（第三线）、C5（第三间）、D5（第四线）、E5（第四间）、F5（第五线）。</p>' },
        { title: '上加线', html: '<p>比第五线更高的音画在<b>上加线</b>上：上加一线是 <b>A5</b>，上加二线是 <b>C6</b>。</p>' },
        { title: '数的方法', html: '<p>数不清时，<b>先找最近的线</b>（二线 G 或五线 F），再一格一格往上数，又快又不容易错。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65, 67, 69, 71, 72], caption: 'C4 ~ C5：一个八度' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'name', target: 5 }
    },
    {
      id: 'jichu-04', line: 'jichu', book: '第一册 · 入门', title: '低音谱号的音（一）', icon: '🎹',
      points: [
        { title: '低音谱表内的音', html: '<p>低音谱号谱表内：第一线 <b>G2</b>、第二线 <b>B2</b>、第三线 <b>D3</b>、第四线 <b>F3</b>、第五线 <b>A3</b>。</p>' },
        { title: '中央 C 在这里', html: '<p>中央 C（C4）在低音谱号上是<b>上加一线</b>。</p>' },
        { title: '记住口诀', html: '<p>“四线 <b>F</b>”——低音谱号的两个点正夹着第四线的 F，谱号自己告诉你了。</p>' }
      ],
      staffDemo: { clef: 'bass', notes: [43, 45, 47, 48, 50, 52], caption: 'G2 A2 B2 C3 D3 E3：低音谱表内' },
      practice: { clef: 'bass', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'jichu-05', line: 'jichu', book: '第一册 · 入门', title: '低音谱号的音（二）', icon: '🧭',
      points: [
        { title: '向下与向上', html: '<p>低音谱号往下：下加一线是 <b>E2</b>，下加二线是 <b>C2</b>。往上：上加一线是中央 C（C4）。</p>' },
        { title: '左手找音', html: '<p>钢琴左边是低音区。看到低音谱号上的音，就找左手方向、比中央 C 更低的琴键。</p>' }
      ],
      staffDemo: { clef: 'bass', notes: [40, 43, 48, 52, 57, 60], caption: 'E2 ~ C4：低音加线区' },
      practice: { clef: 'bass', difficulty: 'standard', mode: 'name', target: 5 }
    },
    {
      id: 'jichu-06', line: 'jichu', book: '第一册 · 入门', title: '音符与时值', icon: '⏱️',
      points: [
        { title: '音符的形状', html: '<p>音符由<b>符头、符干、符尾</b>组成。符头在五线谱上的位置决定音高，形状决定<b>时值（唱多长）</b>。</p>' },
        { title: '常见时值', html: '<p><b>全音符</b>（空心椭圆）唱 4 拍；<b>二分音符</b>（空心+符干）唱 2 拍；<b>四分音符</b>（实心+符干）唱 1 拍。我们的练习都用四分音符。</p>' },
        { title: '拍号', html: '<p>谱号旁边会写拍号，如 <b>4/4、3/4、2/4</b>。上面的数表示每小节几拍，下面的数表示以几分音符为一拍。</p>' },
        { title: '休止符', html: '<p>不发声的地方用休止符：<b>全休止符</b>（挂在第四线上）、<b>二分休止符</b>（站在第三线上）、<b>四分休止符</b>（像闪电）。</p>' }
      ],
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'jichu-07', line: 'jichu', book: '第一册 · 进阶', title: '升降号与黑键', icon: '⚫',
      points: [
        { title: '升号 ♯', html: '<p><b>升号</b>写在音符左边，表示把音<b>升高半音</b>。C 升半音就是 C♯。</p>' },
        { title: '降号 ♭', html: '<p><b>降号</b>表示把音<b>降低半音</b>。B 降半音就是 B♭。</p>' },
        { title: '黑键就是升降音', html: '<p>钢琴上 C 和 D 之间的黑键，既叫 C♯（也叫 D♭）。黑键都是相邻白键之间的半音。</p>' },
        { title: '本课挑战', html: '<p>这一课切换到 <b>88 键</b>难度，练习里会出现带 ♯ 的音符，找一找它们在键盘上的黑键位置吧！</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60], caption: '中央 C（C4）——找找它右边第一个黑键' },
      practice: { clef: 'random', difficulty: 'full', mode: 'name', target: 5 }
    },
    {
      id: 'jichu-08', line: 'jichu', book: '第二册 · 巩固', title: 'C 大调音阶', icon: '🪜',
      points: [
        { title: '全音与半音', html: '<p>相邻琴键（包括黑白键）之间是<b>半音</b>，隔一个琴键是<b>全音</b>。</p>' },
        { title: 'C 大调音阶', html: '<p>C 大调音阶：<b>C D E F G A B C</b>。注意 E→F 和 B→C 是半音，其他都是全音。</p>' },
        { title: '为什么重要', html: '<p>音阶是所有旋律的“建筑材料”。先会认、会听，以后才能顺畅地弹。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65, 67, 69, 71, 72], caption: 'C 大调音阶（C4 ~ C5）' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'keyboard', target: 5 }
    },
    {
      id: 'jichu-09', line: 'jichu', book: '第二册 · 巩固', title: '听一听，音高', icon: '👂',
      points: [
        { title: '耳朵开始工作', html: '<p>识谱不只靠眼睛，还要靠耳朵。先听音，再在键盘上找——这就是“内心听觉”的开始。</p>' },
        { title: '先记住中央 C', html: '<p>听音练习的“尺子”是中央 C。听到一个音，先和中央 C 比一比：高了还是低了？</p>' },
        { title: '本课挑战', html: '<p>这一课用<b>听音辨键</b>模式：听一个音，然后在钢琴键盘上点出它。</p>' }
      ],
      practice: { clef: 'treble', difficulty: 'standard', mode: 'listen', target: 5 }
    },
    {
      id: 'jichu-10', line: 'jichu', book: '第二册 · 巩固', title: '低音听辨', icon: '🦻',
      points: [
        { title: '低音区的耳朵', html: '<p>低音区的声音浑厚低沉。熟悉低音谱号的音，就像左手也长了一双“眼睛”。</p>' },
        { title: '对照键盘', html: '<p>在 88 键键盘的左半部分找低音：越往左，音越低。</p>' }
      ],
      practice: { clef: 'bass', difficulty: 'standard', mode: 'listen', target: 5 }
    },
    {
      id: 'jichu-11', line: 'jichu', book: '第三册 · 进阶', title: '把音放到谱上', icon: '✍️',
      points: [
        { title: '反向思维', html: '<p>前面都是“看谱找音”，现在反过来：<b>知道音名，把音符放到五线谱上</b>。这能检验你是不是真的记住了。</p>' },
        { title: '和弦的种子', html: '<p>三个音叠起来就是<b>三和弦</b>，比如 C E G 组成 C 大三和弦。以后弹伴奏全靠它。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 64, 67], caption: 'C 大三和弦：C E G' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'place', target: 5 }
    },
    {
      id: 'jichu-12', line: 'jichu', book: '第四册 · 综合', title: '综合复习', icon: '🏁',
      points: [
        { title: '全部本领一起上', html: '<p>高音、低音、白键、黑键、看谱、听音、放音符——把所有本领用起来！88 键全音域随机出题，谱号按音区自动切换。</p>' },
        { title: '继续前进', html: '<p>课程到这里就完成啦。每天练习保持连击，点亮更多徽章，你的识谱能力会越来越强！</p>' }
      ],
      practice: { clef: 'random', difficulty: 'full', mode: 'keyboard', target: 5 }
    }
  ];

  /* ---------- 孩子们的拜厄（上下册 · 入门启蒙） ---------- */
  var BAER_COURSES = [
    {
      id: 'baier-01', line: 'baier', book: '上册', title: '认识琴键与中央 C', icon: '🎹',
      points: [
        { title: '钢琴的键盘', html: '<p>钢琴有 <b>88 个琴键</b>：白键和黑键。黑键<b>两个一组、三个一组</b>交替排列，是找音的好帮手。</p>' },
        { title: '中央 C 是“家”', html: '<p>钢琴正中间的 C 叫<b>中央 C（C4）</b>。认谱、弹琴都要先找到它。</p>' },
        { title: '手指编号', html: '<p>两只手的手指都这样编号：<b>1 指=大拇指，2 指=食指，3 指=中指，4 指=无名指，5 指=小指</b>。乐谱上常用数字标指法。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60], caption: '中央 C（C4）：高音谱号下加一线' },
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'baier-02', line: 'baier', book: '上册', title: '右手手位：C D E F G', icon: '👉',
      points: [
        { title: '右手五个音', html: '<p>右手<b>1 指（拇指）放在中央 C</b>，往右依次：C D E F G，小指（5 指）正好落在 G。</p>' },
        { title: '手位不动', html: '<p>拜厄最开始的练习<b>五个手指固定在一个手位</b>，不用移动，专心认识音和节奏。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65, 67], caption: '右手手位：C D E F G' },
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'baier-03', line: 'baier', book: '上册', title: '左手手位：低音谱号', icon: '👈',
      points: [
        { title: '左手五个音', html: '<p>左手<b>5 指（小指）放低音区</b>，低音谱号的音：G2 A2 B2 C3 D3…，拇指（1 指）往右伸向中央 C。</p>' },
        { title: '低音谱号的样子', html: '<p>低音谱号（F 谱号）的两个点<b>夹住第四线 F</b>。看到它就知道这一行是左手。</p>' }
      ],
      staffDemo: { clef: 'bass', notes: [43, 45, 47, 48, 50], caption: '低音谱号：G2 A2 B2 C3 D3' },
      practice: { clef: 'bass', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'baier-04', line: 'baier', book: '上册', title: '音符时值（拜厄版）', icon: '⏱️',
      points: [
        { title: '三种基本音符', html: '<p><b>全音符</b>唱 4 拍（空心椭圆）、<b>二分音符</b>唱 2 拍（空心+符干）、<b>四分音符</b>唱 1 拍（实心+符干）。</p>' },
        { title: '边弹边数', html: '<p>弹琴时心里数拍子：全音符数 1-2-3-4，二分音符数 1-2。节奏稳了，曲子才像曲子。</p>' }
      ],
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'baier-05', line: 'baier', book: '上册', title: '节拍与拍号', icon: '🥁',
      points: [
        { title: '拍号', html: '<p>谱号旁的两个数字叫<b>拍号</b>，如 <b>2/4、3/4、4/4</b>。上面是每小节几拍，下面是几分音符为一拍。</p>' },
        { title: '强弱规律', html: '<p>每一小节第一拍是<b>强拍</b>：2/4 是“强弱”，3/4 是“强弱弱”，4/4 是“强 弱 次强 弱”。</p>' },
        { title: '小节线', html: '<p>竖线把乐谱分成一小节一小节，叫<b>小节线</b>。</p>' }
      ],
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'baier-06', line: 'baier', book: '下册', title: '八分音符', icon: '🏃',
      points: [
        { title: '八分音符', html: '<p><b>八分音符</b>只有半拍（四分音符的一半），符干上多一条<b>符尾</b>。两个八分音符连起来正好一拍。</p>' },
        { title: '数半拍', html: '<p>数“1 和 2 和”——一个数字加一个“和”就是一拍的两种八分音符。</p>' }
      ],
      practice: { clef: 'treble', difficulty: 'standard', mode: 'name', target: 5 }
    },
    {
      id: 'baier-07', line: 'baier', book: '下册', title: '休止符', icon: '🤫',
      points: [
        { title: '不说话也要数', html: '<p><b>休止符</b>表示停一拍或几拍：四分休止符停 1 拍，二分休止符停 2 拍，全休止符停 4 拍。</p>' },
        { title: '休止也是音乐', html: '<p>音乐里的安静和声音一样重要。看到休止符，嘴巴数拍子、手停住。</p>' }
      ],
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'baier-08', line: 'baier', book: '下册', title: '升降号与黑键', icon: '⚫',
      points: [
        { title: '升号与降号', html: '<p><b>♯ 升号</b>让音升高半音，<b>♭ 降号</b>让音降低半音。<b>♮ 还原号</b>取消升降。</p>' },
        { title: '黑键的名字', html: '<p>C 和 D 中间的黑键叫 <b>C♯（或 D♭）</b>。黑键夹在两个白键中间，都是半音。</p>' },
        { title: '本课挑战', html: '<p>切换到 <b>88 键</b>难度，出题会带 ♯，找找它们在键盘上的位置！</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60], caption: '中央 C 右边第一个黑键是 C♯' },
      practice: { clef: 'random', difficulty: 'full', mode: 'name', target: 5 }
    },
    {
      id: 'baier-09', line: 'baier', book: '下册', title: '双手配合', icon: '🤝',
      points: [
        { title: '两只手一起', html: '<p>右手弹高音谱号的旋律，左手弹低音谱号的伴奏。<b>先分手练熟，再合起来</b>。</p>' },
        { title: '左右交替', html: '<p>左右手像对话一样轮流出声，你一句我一句，很考验耳朵和手的配合。</p>' }
      ],
      practice: { clef: 'treble', difficulty: 'standard', mode: 'keyboard', target: 5 }
    },
    {
      id: 'baier-10', line: 'baier', book: '下册', title: '音域扩展', icon: '🌍',
      points: [
        { title: '往两边走', html: '<p>弹熟了中央 C 附近，就可以往<b>高音区和低音区</b>扩展。88 个琴键都是你的地盘。</p>' },
        { title: '听音认位置', html: '<p>听到一个音，猜猜它在键盘的高处还是低处——<b>听音辨键</b>就是最好的练习。</p>' }
      ],
      practice: { clef: 'random', difficulty: 'standard', mode: 'listen', target: 5 }
    }
  ];

  /* ---------- 孩子们的哈农（手指功夫） ---------- */
  var HANON_COURSES = [
    {
      id: 'hanon-01', line: 'hanon', book: '手指基本功', title: '手型与手指编号', icon: '🖐️',
      points: [
        { title: '正确手型', html: '<p>手像握着一个鸡蛋：<b>手腕放松、手指自然弯曲、指尖站直</b>，只有指尖碰琴键。</p>' },
        { title: '手指编号', html: '<p><b>1=拇指、2=食指、3=中指、4=无名指、5=小指</b>。哈农的每一条练习都练某一个手指组合。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65, 67], caption: 'C 手位：1-2-3-4-5 指' },
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'hanon-02', line: 'hanon', book: '手指基本功', title: '断奏与连奏', icon: '🦘',
      points: [
        { title: '断奏（跳音）', html: '<p><b>断奏</b>像小袋鼠跳：每个音短促、有弹性，弹完立刻离键。</p>' },
        { title: '连奏', html: '<p><b>连奏</b>像走路：一个音还没完全松开，下一个音就接上，声音连贯不断开。</p>' }
      ],
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    },
    {
      id: 'hanon-03', line: 'hanon', book: '手指基本功', title: '五指练习', icon: '✋',
      points: [
        { title: 'C D E F G 上下行', html: '<p>1-2-3-4-5 指依次弹 <b>C D E F G</b>，再 5-4-3-2-1 弹回来。慢练、高抬指，让每个手指独立。</p>' },
        { title: '慢就是快', html: '<p>哈农的精髓是<b>慢速高抬指</b>：快了手会僵，慢下来手指才练得扎实。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65, 67, 65, 64, 62], caption: '五指上下行：C D E F G F E D C' },
      practice: { clef: 'treble', difficulty: 'easy', mode: 'keyboard', target: 5 }
    },
    {
      id: 'hanon-04', line: 'hanon', book: '手指基本功', title: '音域扩展练习', icon: '↔️',
      points: [
        { title: '一个八度的跨越', html: '<p>从 C4 一路弹到 C5（一个八度），手位会移动，但手型要保持住。</p>' },
        { title: '换手位', html: '<p>手位移动时<b>手腕先“带路”</b>，手指跟着走，不要整只手僵硬地横移。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65, 67, 69, 71, 72], caption: 'C4 ~ C5 八度上行' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'keyboard', target: 5 }
    },
    {
      id: 'hanon-05', line: 'hanon', book: '手指基本功', title: 'C 大调音阶与穿指', icon: '🪜',
      points: [
        { title: '音阶指法', html: '<p>C 大调音阶右手指法：<b>1 2 3 1 2 3 4 5</b>。弹到 3 指时，1 指从下面“穿”过去，叫<b>穿指</b>。</p>' },
        { title: '连贯的秘密', html: '<p>穿指动作要轻、要快，这样音阶听起来才像一串连贯的珠子。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65, 67, 69, 71, 72], caption: 'C 大调音阶：C D E F G A B C' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'keyboard', target: 5 }
    },
    {
      id: 'hanon-06', line: 'hanon', book: '手指基本功', title: '琶音', icon: '🌈',
      points: [
        { title: '什么是琶音', html: '<p><b>琶音</b>就是把和弦的音一个接一个弹出来，像把彩虹展开：C 大三和弦琶音 = C E G C。</p>' },
        { title: '手腕放松', html: '<p>琶音跨度大，<b>手腕要画小弧线</b>帮忙“带路”，手指才能又快又准。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 64, 67, 72], caption: 'C 大调琶音：C E G C' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'place', target: 5 }
    },
    {
      id: 'hanon-07', line: 'hanon', book: '手指基本功', title: '双手同向练习', icon: '🪞',
      points: [
        { title: '双手相隔八度', html: '<p>左手低八度、右手高八度，同时弹同一个音阶，像照镜子一样<b>同向同步</b>。</p>' },
        { title: '两只手一样重要', html: '<p>很多人右手强左手弱。双手同向练习能让<b>左手和右手一样灵活</b>。</p>' }
      ],
      practice: { clef: 'bass', difficulty: 'standard', mode: 'keyboard', target: 5 }
    },
    {
      id: 'hanon-08', line: 'hanon', book: '手指基本功', title: '综合手指练习', icon: '🏋️',
      points: [
        { title: '全部手指功夫', html: '<p>音阶、琶音、断奏、连奏、穿指——把学到的手指功夫在 <b>88 键全键盘</b>上综合运用。</p>' },
        { title: '坚持的力量', html: '<p>哈农要<b>每天练</b>才有效果。每天 10 分钟，手指会越来越听话！</p>' }
      ],
      practice: { clef: 'random', difficulty: 'full', mode: 'listen', target: 5 }
    }
  ];

  /* ================= 扩充课程（第四期） ================= */
  var EXTRA_BAER = [
    {
      id: 'baier-11', line: 'baier', book: '下册', title: '双手同音与八度', icon: '✋',
      points: [
        { title: '两只手弹同一个音', html: '<p>左手和右手可以弹<b>同一个音</b>，也可以弹<b>相隔一个八度</b>的同一个音名。听起来更厚实。</p>' },
        { title: '八度的距离', html: '<p>从 C 到高音 C 是 8 个音级、12 个半音。在键盘上数一数，正好跳过 7 个白键。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 72], caption: 'C4 与 C5：相隔一个八度' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'keyboard', target: 5 }
    },
    {
      id: 'baier-12', line: 'baier', book: '下册', title: '休止符与呼吸', icon: '⏸️',
      points: [
        { title: '休止符也是音乐', html: '<p>休止符表示<b>不发声</b>，但时间照样在走。乐句之间的停顿就像说话时的呼吸。</p>' },
        { title: '数拍子', html: '<p>遇到四分休止符时，心里默数「空」，不要抢拍也不要拖拍。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 65], caption: '音符与休止交替出现' },
      practice: { clef: 'treble', difficulty: 'easy', mode: 'name', target: 5 }
    }
  ];

  var EXTRA_JICHU = [
    {
      id: 'jichu-13', line: 'jichu', book: '第四册 · 综合', title: '附点节奏', icon: '🎯',
      points: [
        { title: '什么是附点', html: '<p>音符右边加一个小圆点，表示<b>延长原时值的一半</b>。附点四分音符 = 1.5 拍。</p>' },
        { title: '长-短的感觉', html: '<p>附点节奏听起来是「<b>长—短</b>」，像走路时一步大一步小，很有弹性。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 62, 64, 67], caption: '附点四分 + 八分：长—短' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'name', target: 5 }
    },
    {
      id: 'jichu-14', line: 'jichu', book: '第四册 · 综合', title: 'G 大调与升号', icon: '🎼',
      points: [
        { title: 'G 大调的调号', html: '<p>G 大调有一个升号：<b>F♯</b>。看到调号里的升号，整首曲子的 F 都要升高半音。</p>' },
        { title: '找到 F♯', html: '<p>F♯ 在键盘上是 F 右边紧挨着的黑键。谱面上它画在 F 的位置，前面加 ♯。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [67, 69, 71, 72, 74, 76, 78, 79], caption: 'G 大调音阶（含 F♯）' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'keyboard', target: 5 }
    },
    {
      id: 'jichu-15', line: 'jichu', book: '第四册 · 综合', title: '三和弦入门', icon: '🎹',
      points: [
        { title: '三个音叠起来', html: '<p>三和弦由<b>三个音</b>按三度叠置组成。C 大三和弦 = C + E + G。</p>' },
        { title: '和弦的色彩', html: '<p>大三和弦听起来明亮，小三和弦听起来柔和。以后听到和弦就能感觉到“情绪”。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 64, 67], caption: 'C 大三和弦：C E G' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'place', target: 5 }
    }
  ];

  var EXTRA_HANON = [
    {
      id: 'hanon-09', line: 'hanon', book: '手指基本功', title: '同音换指', icon: '🔄',
      points: [
        { title: '同一个音换手指', html: '<p>同一个琴键可以用不同手指轮流弹（如 3-2-1），让每个手指都得到锻炼。</p>' },
        { title: '均匀最重要', html: '<p>换指时声音要<b>一样响、一样长</b>，不能因为换手指而出现重音。</p>' }
      ],
      practice: { clef: 'treble', difficulty: 'standard', mode: 'keyboard', target: 5 }
    },
    {
      id: 'hanon-10', line: 'hanon', book: '手指基本功', title: '双音与和弦', icon: '🎶',
      points: [
        { title: '两个音一起弹', html: '<p>三度、六度双音需要两个手指同时下键，手要放松、下键要齐。</p>' },
        { title: '听整齐度', html: '<p>两个音如果一前一后，听起来会“脏”。慢练，确保<b>同时发声</b>。</p>' }
      ],
      staffDemo: { clef: 'treble', notes: [60, 64], caption: '三度双音：C 与 E' },
      practice: { clef: 'treble', difficulty: 'standard', mode: 'name', target: 5 }
    }
  ];

  var LINES = [
    { id: 'baier', name: '孩子们的拜厄', icon: '📗', sub: '入门启蒙 · 上下册', courses: BAER_COURSES.concat(EXTRA_BAER) },
    { id: 'jichu', name: '钢琴基础教程', icon: '📘', sub: '系统进阶 · 四册', courses: JICHU_COURSES.concat(EXTRA_JICHU) },
    { id: 'hanon', name: '孩子们的哈农', icon: '🖐️', sub: '手指功夫', courses: HANON_COURSES.concat(EXTRA_HANON) }
  ];
  var COURSES = JICHU_COURSES.concat(EXTRA_JICHU).concat(BAER_COURSES).concat(EXTRA_BAER)
    .concat(HANON_COURSES).concat(EXTRA_HANON);

  global.CourseData = { COURSES: COURSES, LINES: LINES };
})(typeof window !== 'undefined' ? window : globalThis);
