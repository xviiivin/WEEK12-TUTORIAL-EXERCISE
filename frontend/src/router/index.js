import Vue from 'vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/Home.vue')
  },
  {
    path: '/blogs/detail/:id',
    name: 'detail',
    component: () => import('../views/blogs/DetailBlog.vue')
  },
  {
    path: '/blogs/create',
    name: 'create-blog',
    meta: { login: true },
    component: () => import('../views/blogs/CreateBlog.vue')
  },
  {
    path: '/blogs/update/:id',
    name: 'update-blog',
    meta: { login: true },
    component: () => import('../views/blogs/UpdateBlog.vue')
  },
  {
    path: '/user/signup',
    name: 'signup',
    meta: { guess: true },
    component: () => import('../views/Signup.vue')
  },
  {
    path: '/user/login',
    name: 'login',
    meta: { guess: true },
    component: () => import('../views/Login.vue')
  }
]

const router = new VueRouter({ routes })

export default router
