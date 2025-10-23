// 修改加载完成后处理函数的延迟时间为1500ms
// 卡片翻转功能
const card1 = document.getElementById('infoCard1');
card1.addEventListener('click', function() {
this.classList.toggle('flipped');
});
const card2 = document.getElementById('infoCard2');
card2.addEventListener('click', function() {
this.classList.toggle('flipped');
});
// 改进鼠标跟随文字功能 - 完善边界检查
const cardContainer1 = document.getElementById('cardContainer1');
const tooltip1 = document.getElementById('cardTooltip1');
cardContainer1.addEventListener('mousemove', function(e) {
const rect = cardContainer1.getBoundingClientRect();
const tooltipWidth = tooltip1.offsetWidth;
const tooltipHeight = tooltip1.offsetHeight;
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;

// 计算初始位置（相对于容器）
let left = e.clientX - rect.left + 12;
let top = e.clientY - rect.top - 27;

// 计算相对于视口的绝对位置
const absoluteLeft = rect.left + left;
const absoluteTop = rect.top + top;

// 检查右侧边界
if (absoluteLeft + tooltipWidth > viewportWidth) {
  left = e.clientX - rect.left - tooltipWidth - 12;
}

// 检查左侧边界
if (absoluteLeft < 0) {
  left = 12; // 距离容器左侧12px
}

// 检查顶部边界
if (absoluteTop < 0) {
  top = e.clientY - rect.top + 12;
}

// 检查底部边界
if (absoluteTop + tooltipHeight > viewportHeight) {
  top = e.clientY - rect.top - tooltipHeight - 12;
}

tooltip1.style.left = left + 'px';
tooltip1.style.top = top + 'px';
});
const cardContainer2 = document.getElementById('cardContainer2');
const tooltip2 = document.getElementById('cardTooltip2');
cardContainer2.addEventListener('mousemove', function(e) {
const rect = cardContainer2.getBoundingClientRect();
const tooltipWidth = tooltip2.offsetWidth;
const tooltipHeight = tooltip2.offsetHeight;
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;

// 计算初始位置（相对于容器）
let left = e.clientX - rect.left + 12;
let top = e.clientY - rect.top - 27;

// 计算相对于视口的绝对位置
const absoluteLeft = rect.left + left;
const absoluteTop = rect.top + top;

// 检查右侧边界
if (absoluteLeft + tooltipWidth > viewportWidth) {
  left = e.clientX - rect.left - tooltipWidth - 12;
}

// 检查左侧边界
if (absoluteLeft < 0) {
  left = 12; // 距离容器左侧12px
}

// 检查顶部边界
if (absoluteTop < 0) {
  top = e.clientY - rect.top + 12;
}

// 检查底部边界
if (absoluteTop + tooltipHeight > viewportHeight) {
  top = e.clientY - rect.top - tooltipHeight - 12;
}

tooltip2.style.left = left + 'px';
tooltip2.style.top = top + 'px';
});
// 导航栏滚动显示/隐藏功能
const navbar = document.getElementById('navbar');
let lastScrollTop = 0;
window.addEventListener('scroll', function() {
const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
if (scrollTop > lastScrollTop && scrollTop > 50) {
  navbar.classList.add('hidden');
} else {
  navbar.classList.remove('hidden');
}
lastScrollTop = scrollTop;
});
// 侧边栏相关功能
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');

// 打开侧边栏
function openSidebar() {
sidebar.classList.add('open');
overlay.classList.add('open');
menuBtn.classList.add('rotated');
// 防止背景滚动
document.body.style.overflow = 'hidden';
}

// 关闭侧边栏
function closeSidebar() {
sidebar.classList.remove('open');
overlay.classList.remove('open');
menuBtn.classList.remove('rotated');
// 恢复背景滚动
document.body.style.overflow = '';
// 关闭所有子菜单
document.querySelectorAll('.sidebar-submenu').forEach(submenu => {
  submenu.classList.remove('open');
});
document.querySelectorAll('.sidebar-item.has-submenu').forEach(item => {
  item.classList.remove('open');
});
}

// 菜单按钮点击事件 - 更快的动画速度
menuBtn.addEventListener('click', function() {
// 移除类并触发重绘，确保每次点击都有完整动画
this.classList.remove('rotated');
void this.offsetWidth;

if (sidebar.classList.contains('open')) {
  closeSidebar();
} else {
  this.classList.add('rotated');
  sidebar.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
});

// 点击遮罩层关闭侧边栏
overlay.addEventListener('click', closeSidebar);

// 二级菜单展开/折叠功能
document.querySelectorAll('.sidebar-item.has-submenu').forEach(item => {
const link = item.querySelector('.sidebar-link');
const submenu = item.querySelector('.sidebar-submenu');

link.addEventListener('click', function(e) {
  e.preventDefault();
  // 切换当前子菜单的显示状态
  submenu.classList.toggle('open');
  item.classList.toggle('open');
});
});

// 点击侧边栏链接关闭侧边栏
document.querySelectorAll('.sidebar-link:not(.has-submenu .sidebar-link)').forEach(link => {
link.addEventListener('click', function(e) {
  if (!this.getAttribute('href').includes('specialgo.html')) {
    e.preventDefault();
  }
  closeSidebar();
});
});
// 自定义平滑滚动函数（可选）
function scrollToTop() {
const scrollDuration = 500; // 滚动持续时间（毫秒）
const startScrollTop = window.pageYOffset;
const startTime = performance.now();

function animateScroll(currentTime) {
  const elapsedTime = currentTime - startTime;
  const progress = Math.min(elapsedTime / scrollDuration, 1);
  // 使用缓动函数使滚动更自然
  const easeProgress = progress < 0.5 
    ? 4 * progress * progress * progress 
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

  window.scrollTo(0, startScrollTop * (1 - easeProgress));

  if (progress < 1) {
    requestAnimationFrame(animateScroll);
  }
}

requestAnimationFrame(animateScroll);
}
// 首页按钮点击事件 - 使用自定义滚动
document.getElementById('sidebarHomeBtn').addEventListener('click', function(e) {
e.preventDefault();
scrollToTop();
closeSidebar();
});
// 强制触发邮件链接
document.getElementById('contactBtn').addEventListener('click', function(e) {
e.stopPropagation(); // 防止被父元素事件拦截
window.location.href = this.href; // 直接跳转
});
// logo点击：180度立体反转/回正切换
document.getElementById('logo').addEventListener('click', function() {
const logo = this;
// 切换“反转180度”类
logo.classList.toggle('flip-180');

});
// 阻止文本选择
document.addEventListener('selectstart', function(e) {
e.preventDefault();
return false;
});
// 阻止复制
document.addEventListener('copy', function(e) {
e.preventDefault();
return false;
});
// 阻止剪切
document.addEventListener('cut', function(e) {
e.preventDefault();
return false;
});
// 阻止右键菜单（可选，防止通过右键复制）
document.addEventListener('contextmenu', function(e) {
e.preventDefault();
return false;
});
// 添加JavaScript确保链接可点击跳转
document.addEventListener('DOMContentLoaded', function() {
// 获取关于链接元素
const aboutLink = document.getElementById('about-link');

if (aboutLink) {
  // 确保链接没有被阻止默认行为
  aboutLink.addEventListener('click', function(e) {
    // 移除可能存在的阻止跳转代码
    // e.preventDefault();

    // 确保路径正确，如果在子目录中需要调整路径
    const href = this.getAttribute('href');

    // 手动跳转作为备选方案
    setTimeout(() => {
      window.location.href = href;
    }, 100);
  });
}
});
// 阻止所有链接被拖动
document.addEventListener('DOMContentLoaded', function() {
// 选择所有链接元素
const links = document.querySelectorAll('a');

links.forEach(link => {
  // 阻止拖动开始事件
  link.addEventListener('dragstart', function(e) {
    e.preventDefault();
    return false;
  });

  // 可选：添加样式提示用户无法拖动
  link.style.userSelect = 'none';
});
});
// 等待页面DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
const loadingScreen = document.querySelector('.loading-screen');
const logoImg = document.querySelector('.loading-logo'); // 假设logo的class是loading-logo

// 标记logo是否已加载
let logoLoaded = false;
// 标记页面资源是否已加载完成
let pageLoaded = false;

// 监听logo图片加载完成事件
if (logoImg) {
  logoImg.onload = function() {
    logoLoaded = true;
    checkIfCanEnter(); // 检查是否可以进入页面
  };

  // 处理图片加载失败的情况
  logoImg.onerror = function() {
    console.warn('Logo加载失败，将在页面加载完成后进入');
    logoLoaded = true; // 即使失败也视为已处理
    checkIfCanEnter();
  };

  // 如果图片已经缓存好了，手动触发load事件
  if (logoImg.complete) {
    logoImg.onload();
  }
} else {
  // 如果没有找到logo元素，直接标记为已加载
  logoLoaded = true;
}

// 监听页面所有资源加载完成
window.onload = function() {
  pageLoaded = true;
  checkIfCanEnter();
};

// 检查是否可以进入页面（logo和页面资源都加载完成）
function checkIfCanEnter() {
  if (logoLoaded && pageLoaded) {
    // 可以在这里添加一点延迟，让用户看清logo
    setTimeout(() => {
      loadingScreen.style.visibility = 'hidden';
      // 可选：添加过渡动画
      loadingScreen.style.transition = 'opacity 0.05s ease, visibility 0.05s ease';
    }, 50); // 300毫秒延迟，可调整
  }
}
})
