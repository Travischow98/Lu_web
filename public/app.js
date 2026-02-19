const products = [
  { id: 1, name: 'Tour Knit Polo', price: 88 },
  { id: 2, name: 'Links Pleated Shorts', price: 74 },
  { id: 3, name: 'Bucket Hat', price: 42 },
  { id: 4, name: 'Leather Glove Set', price: 36 },
  { id: 5, name: 'Performance Quarter Zip', price: 108 },
  { id: 6, name: 'Signature Ball Marker', price: 24 }
];

const cart = [];

const productsEl = document.getElementById('products');
const cartItemsEl = document.getElementById('cartItems');
const cartTotalEl = document.getElementById('cartTotal');
const checkoutForm = document.getElementById('checkoutForm');
const statusMessageEl = document.getElementById('statusMessage');
const refreshOrdersButton = document.getElementById('refreshOrders');
const orderCountEl = document.getElementById('orderCount');
const ordersTableEl = document.getElementById('ordersTable');

function renderProducts() {
  productsEl.innerHTML = products
    .map(
      (product) => `
      <article class="product-card">
        <h4>${product.name}</h4>
        <p>$${product.price}</p>
        <button onclick="addToCart(${product.id})">Add to Cart</button>
      </article>`
    )
    .join('');
}

function addToCart(productId) {
  const product = products.find((item) => item.id === productId);
  const existing = cart.find((item) => item.id === productId);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  renderCart();
}

window.addToCart = addToCart;

function renderCart() {
  if (!cart.length) {
    cartItemsEl.innerHTML = '<p>Your cart is empty.</p>';
    cartTotalEl.textContent = '0';
    return;
  }

  cartItemsEl.innerHTML = cart
    .map((item) => `<p>${item.name} × ${item.quantity} - $${item.price * item.quantity}</p>`)
    .join('');

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  cartTotalEl.textContent = total.toFixed(2);
}

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!cart.length) {
    statusMessageEl.textContent = 'Please add at least one item to your cart.';
    return;
  }

  const payload = {
    customerName: document.getElementById('customerName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    items: cart.map(({ name, price, quantity }) => ({ name, price, quantity }))
  };

  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    statusMessageEl.textContent = data.error || 'Could not place order.';
    return;
  }

  statusMessageEl.textContent = `Thanks! Your order ID is ${data.orderId}.`;
  cart.length = 0;
  checkoutForm.reset();
  renderCart();
  loadOrders();
});

async function loadOrders() {
  const response = await fetch('/api/orders/summary');
  const data = await response.json();

  orderCountEl.textContent = data.orderCount;

  ordersTableEl.innerHTML = data.orders
    .slice()
    .reverse()
    .map(
      (order) => `
      <div class="order-row">
        <strong>${order.customerName}</strong> (${order.email}, ${order.phone})<br />
        ${order.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}
      </div>`
    )
    .join('');

  if (!data.orders.length) {
    ordersTableEl.innerHTML = '<p>No orders yet.</p>';
  }
}

refreshOrdersButton.addEventListener('click', loadOrders);

renderProducts();
renderCart();
loadOrders();
