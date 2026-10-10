/* ============================================================
   interactions.js — 全站顺滑交互层
   1. 顶栏随滚动收起/展开
   2. 顶部导航滑动指示条
   3. Tab 切换内容淡入
   4. 手风琴箭头旋转变形 + 分组展开过渡
   5. 提交按钮状态反馈（加载 → 完成）
   ============================================================ */
(function () {
  'use strict';

  /* ---- 1. 顶栏随滚动收起：向下滚隐藏，向上滚立即展开 ---- */
  var header = document.querySelector('header');
  if (header) {
    var lastY = window.scrollY, ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y > lastY + 6 && y > 120) {
          header.classList.add('hd-hidden');
        } else if (y < lastY - 4 || y < 60) {
          header.classList.remove('hd-hidden');
        }
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---- 2. 导航滑动指示条：跟随 active 按钮移动 ---- */
  var nav = document.querySelector('.nav');
  if (nav) {
    var bar = document.createElement('span');
    bar.className = 'nav-indicator';
    nav.appendChild(bar);
    var moveBar = function (btn) {
      if (!btn) return;
      bar.style.width = btn.offsetWidth + 'px';
      bar.style.transform = 'translateX(' + (btn.offsetLeft - nav.scrollLeft) + 'px)';
      bar.style.opacity = '1';
    };
    var sync = function () {
      moveBar(nav.querySelector('button.active'));
    };
    // 监听 active 类变化（任意代码切换 tab 都会带动指示条）
    var mo = new MutationObserver(sync);
    nav.querySelectorAll('button').forEach(function (b) {
      mo.observe(b, { attributes: true, attributeFilter: ['class'] });
    });
    window.addEventListener('resize', sync);
    nav.addEventListener('scroll', sync, { passive: true });
    setTimeout(sync, 80);
    setTimeout(sync, 600); // 字体/布局稳定后校准
  }

  /* ---- 3. Tab 内容淡入 ---- */
  document.querySelectorAll('.nav button[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      var sec = document.querySelector('#tab-' + b.dataset.tab);
      if (!sec) return;
      sec.classList.remove('tab-enter');
      void sec.offsetWidth; // 重触发动画
      sec.classList.add('tab-enter');
    });
  });

  /* ---- 4. 手风琴：箭头旋转变形 + 分组展开过渡 ----
     tg() 用 display 切换；这里给 body 加 .eg-open 触发入场动画，
     caret 改为常驻字符，由 .open 旋转 90°，替代文字硬切换。 */
  window.tg = (function (orig) {
    return function (id) {
      var body = document.getElementById(id);
      var caret = document.getElementById('caret-' + id);
      if (body) {
        var opening = body.style.display === 'none';
        if (caret && !caret._rot) {
          caret.textContent = '▸';
          caret._rot = true;
        }
        var r = orig(id);
        if (caret) {
          if (caret._rot) caret.textContent = '▸'; // 复位字符，方向交给旋转
          caret.classList.toggle('open', opening);
        }
        if (opening) {
          body.classList.remove('eg-enter');
          void body.offsetWidth;
          body.classList.add('eg-enter');
        }
        return r;
      }
      return orig(id);
    };
  })(window.tg);

  /* ---- 5. 提交按钮状态反馈 ----
     点击「交卷/提交」类按钮：原地 变加载态 → 完成态（或自动还原），
     不跳转不变位置；成功后结果区整体替换，按钮自然消失。 */
  var SUBMIT_FNS = ['submitExam', 'submitPractice', 'submitLawQ',
    'submitMemory', 'submitMr', 'submitHw'];
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.btn') : null;
    if (!b) return;
    var oc = (b.getAttribute('onclick') || '').trim();
    for (var i = 0; i < SUBMIT_FNS.length; i++) {
      if (oc.indexOf(SUBMIT_FNS[i] + '(') === 0) { window._activeSubmitBtn = b; return; }
    }
  }, true);

  SUBMIT_FNS.forEach(function (fn) {
    if (typeof window[fn] !== 'function') return;
    var orig = window[fn];
    window[fn] = function () {
      var args = arguments;
      var b = window._activeSubmitBtn;
      window._activeSubmitBtn = null;
      var locked = false;
      if (b && b.isConnected && !b.disabled) {
        locked = true;
        b.disabled = true;
        b.classList.add('btn-loading');
        b.dataset.orig = b.innerHTML;
        b.innerHTML = '<span class="btn-spin"></span>提交中…';
      }
      var restore = function () {
        if (!b) return;
        // 结果区替换后按钮已不在 DOM，无需还原
        if (b.isConnected) {
          b.disabled = false;
          b.classList.remove('btn-loading', 'btn-done');
          if (b.dataset.orig) b.innerHTML = b.dataset.orig;
        }
      };
      var res;
      try {
        res = orig.apply(this, args);
      } catch (err) {
        restore();
        throw err;
      }
      if (res && typeof res.then === 'function') {
        return res.then(function (v) {
          if (locked && b && b.isConnected) {
            b.classList.remove('btn-loading');
            b.classList.add('btn-done');
            b.innerHTML = '✓ 已提交';
          }
          setTimeout(restore, 700);
          return v;
        }, function (err) {
          restore();
          throw err;
        });
      }
      setTimeout(restore, 700);
      return res;
    };
  });
  /* ---- 6. 选项选中微动效 ---- */
  document.addEventListener('click', function (e) {
    var opt = e.target.closest ? e.target.closest('.opt') : null;
    if (!opt) return;
    opt.classList.remove('picked');
    void opt.offsetWidth;
    opt.classList.add('picked');
  }, true);
})();
