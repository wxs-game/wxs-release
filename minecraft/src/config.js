export const CONFIG = Object.freeze({
    api: 'https://nkovsjhwinbbapsqvpnu.supabase.co/rest/v1/rpc/',
    key: 'sb_publishable_GVUZWdR9qVSHwL7aL63W8w_g7rtfJkN',
    bot: 'https://t.me/wxsgame',
    admin: 6130985988,
    width: 20,
    depth: 50,
    reach: 5.2,
    fov: 90,
});

export const BLOCKS = [
    null,
    { name: 'Сланец', color: '#67787a' },
    { name: 'Грунт', color: '#86694e' },
    { name: 'Дёрн', color: '#679a66' },
    { name: 'Базальт', color: '#38464c' },
    { name: 'Уголь', price: 10, color: '#424952' },
    { name: 'Медь', price: 15, color: '#ef9163' },
    { name: 'Железо', price: 25, color: '#e8c5a4' },
    { name: 'Золото', price: 50, color: '#ffc64f' },
    { name: 'Лазурит', price: 65, color: '#72a7ff' },
    { name: 'Редстоун', price: 75, color: '#f57584' },
    { name: 'Алмаз', price: 100, color: '#76f7ec' },
];

export const usd = (amount) => '$' + Number(amount).toFixed(4).replace(/(\.\d{2})0+$/, '$1').replace(/(\.\d{3})0$/, '$1');
