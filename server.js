const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
  }
}

function getOrders() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8') || '[]');
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) {
        req.socket.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildExcelXml(orders) {
  const header = ['OrderID', 'Date', 'CustomerName', 'Email', 'Phone', 'Product', 'Quantity', 'UnitPrice', 'LineTotal', 'OrderTotal'];
  const rows = [];

  rows.push(`<Row>${header.map((col) => `<Cell><Data ss:Type="String">${col}</Data></Cell>`).join('')}</Row>`);

  orders.forEach((order) => {
    order.items.forEach((item) => {
      const values = [
        order.id,
        order.createdAt,
        order.customerName,
        order.email,
        order.phone,
        item.name,
        item.quantity,
        item.price,
        item.quantity * item.price,
        order.total
      ];

      rows.push(
        `<Row>${values
          .map((value, index) => {
            const isNumber = index >= 6;
            return `<Cell><Data ss:Type="${isNumber ? 'Number' : 'String'}">${escapeXml(value)}</Data></Cell>`;
          })
          .join('')}</Row>`
      );
    });
  });

  if (orders.length === 0) {
    rows.push('<Row><Cell><Data ss:Type="String">No orders yet.</Data></Cell></Row>');
  }

  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Orders">
  <Table>
   ${rows.join('\n')}
  </Table>
 </Worksheet>
</Workbook>`;
}

function serveStatic(reqPath, res) {
  let filePath = reqPath === '/' ? '/index.html' : reqPath;
  filePath = path.join(PUBLIC_DIR, filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript'
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && requestUrl.pathname === '/api/orders') {
    try {
      const body = await parseBody(req);
      const { customerName, email, phone, items } = body;

      if (!customerName || !email || !phone || !Array.isArray(items) || items.length === 0) {
        return sendJson(res, 400, { error: 'Missing required fields.' });
      }

      const normalizedItems = items
        .filter((item) => item && item.name && Number(item.quantity) > 0)
        .map((item) => ({
          name: String(item.name),
          quantity: Number(item.quantity),
          price: Number(item.price) || 0
        }));

      if (!normalizedItems.length) {
        return sendJson(res, 400, { error: 'Order must include at least one valid item.' });
      }

      const orders = getOrders();
      const order = {
        id: `ORD-${Date.now()}`,
        createdAt: new Date().toISOString(),
        customerName,
        email,
        phone,
        items: normalizedItems,
        total: normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
      };

      orders.push(order);
      saveOrders(orders);

      return sendJson(res, 201, {
        message: 'Order placed successfully.',
        orderId: order.id,
        orderCount: orders.length
      });
    } catch (_error) {
      return sendJson(res, 400, { error: 'Invalid JSON body.' });
    }
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/orders/summary') {
    const orders = getOrders();
    return sendJson(res, 200, { orderCount: orders.length, orders });
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/orders/export') {
    const xml = buildExcelXml(getOrders());
    res.writeHead(200, {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': `attachment; filename="golf-orders-${Date.now()}.xls"`
    });
    res.end(xml);
    return;
  }

  if (req.method === 'GET') {
    serveStatic(requestUrl.pathname, res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
