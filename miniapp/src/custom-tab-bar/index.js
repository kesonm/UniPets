const tabs = [
  { page: 'pages/home/index', icon: 'home', label: '首页' },
  { page: 'pages/friends/index', icon: 'friends', label: '交友' },
  { page: 'pages/orders/index', icon: 'cart', label: '购物车' },
  { page: 'pages/pets/index', icon: 'identity', label: '宠物身份证' },
  { page: 'pages/account/index', icon: 'me', label: '我的' },
]

Component({
  data: { tabs, activePage: '', cartCount: 0 },
  lifetimes: {
    attached() { this.refresh() },
  },
  pageLifetimes: {
    show() { this.refresh() },
  },
  methods: {
    refresh() {
      const pages = getCurrentPages()
      const activePage = pages[pages.length - 1]?.route || tabs[0].page
      const owner = wx.getStorageSync('petcloud.wx.session.v1')?.user?.id
      const cart = owner ? wx.getStorageSync('petcloud.cart.' + owner) : null
      const cartCount = Array.isArray(cart?.items) ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0
      this.setData({ activePage, cartCount })
    },
    navigate(event) {
      const page = event.currentTarget.dataset.page
      if (page !== this.data.activePage) wx.switchTab({ url: '/' + page })
    },
  },
})
