require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { auth, allow } = require('./middleware');
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' })); app.use(morgan('dev'));
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
async function log(userId, action, module, recordId, details='') { await db.execute('INSERT INTO activity_logs (user_id, action, module, record_id, details) VALUES (?,?,?,?,?)',[userId,action,module,recordId,details]); }
const httpError=(message,status=400)=>{const error=new Error(message);error.status=status;return error;};
const roundMoney=value=>Math.round((Number(value)||0)*100)/100;
function cleanImage(value){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value!=='string')throw httpError('Invalid image data.');
  const image=value.trim();
  if(image.length>7_000_000)throw httpError('Image is too large. Please choose a smaller image.');
  if(!/^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(image))throw httpError('Please upload a valid image file.');
  return image;
}
function sqlDateTime(value){if(!value)return null;const text=String(value).trim().replace('T',' ');return text.length===16?text+':00':text;}
function normalizePromo(body){
  const {name,description,discount_type,discount_value,product_id,image_url,starts_at,expires_at,is_active}=body;
  if(!name||!String(name).trim())throw httpError('Promo name is required.');
  if(!['Percent','Fixed'].includes(discount_type))throw httpError('Choose a valid discount type.');
  const value=Number(discount_value);
  if(!Number.isFinite(value)||value<=0)throw httpError('Enter a discount value greater than zero.');
  if(discount_type==='Percent'&&value>100)throw httpError('Percentage discount cannot be more than 100%.');
  if(!expires_at)throw httpError('Set an expiration date and time.');
  const start=starts_at?new Date(sqlDateTime(starts_at).replace(' ','T')):null;
  const end=new Date(sqlDateTime(expires_at).replace(' ','T'));
  if(start&&Number.isNaN(start.getTime()))throw httpError('Enter a valid start date and time.');
  if(Number.isNaN(end.getTime()))throw httpError('Enter a valid expiration date and time.');
  if(start&&start>=end)throw httpError('Expiration must be after the start time.');
  return {
    name:String(name).trim(),description:description||'',discount_type,discount_value:roundMoney(value),
    product_id:product_id?Number(product_id):null,image_url:cleanImage(image_url),
    starts_at:sqlDateTime(starts_at),expires_at:sqlDateTime(expires_at),
    is_active:is_active===undefined?1:(is_active?1:0)
  };
}
async function ensurePromoProduct(productId){
  if(!productId)return;
  const [[product]]=await db.execute('SELECT id FROM products WHERE id=?',[productId]);
  if(!product)throw httpError('The selected product was not found.');
}
app.get('/', (req,res) => res.send('Cafe Munaco API is running.'));
app.get('/api/health', asyncRoute(async(req,res)=>{ await db.query('SELECT 1'); res.json({status:'ok',database:'connected'}); }));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const { email, password } = req.body; if(!email || !password) return res.status(400).json({message:'Email and password are required.'});
  const [rows] = await db.execute('SELECT id,name,email,password_hash,role,is_active FROM users WHERE email=? LIMIT 1',[email]);
  const user=rows[0]; if(!user || !user.is_active || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({message:'Invalid email or password.'});
  const token=jwt.sign({id:user.id,name:user.name,email:user.email,role:user.role},process.env.JWT_SECRET,{expiresIn:'8h'});
  await log(user.id,'Login','Authentication',user.id); res.json({token,user:{id:user.id,name:user.name,email:user.email,role:user.role}});
}));
app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user}));
app.get('/api/dashboard/summary',auth,allow('Owner / Manager'),asyncRoute(async(req,res)=>{
 const [[o]]=await db.query("SELECT COUNT(*) totalOrders, COALESCE(SUM(total_amount),0) sales, SUM(status IN ('Pending','Confirmed','Preparing')) pendingOrders, SUM(status='Completed') completedOrders FROM orders WHERE DATE(created_at)=CURDATE()");
 const [[i]]=await db.query('SELECT COUNT(*) totalItems, SUM(quantity <= minimum_stock) lowStock FROM inventory');
 const [[r]]=await db.query("SELECT COUNT(*) activeReservations FROM reservations WHERE reservation_date >= CURDATE() AND status IN ('Pending','Confirmed')");
 const [recent]=await db.query('SELECT id,order_number,customer_name,total_amount,status,created_at FROM orders ORDER BY created_at DESC LIMIT 6');
 const [sales]=await db.query("SELECT DATE_FORMAT(created_at,'%a') day, SUM(total_amount) amount FROM orders WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND status <> 'Cancelled' GROUP BY DATE(created_at) ORDER BY DATE(created_at)");
 res.json({ ...o,...i,...r,recent,sales });
}));
app.get('/api/notifications',auth,asyncRoute(async(req,res)=>{
  const [lowStock]=await db.query(`SELECT id,item_name,category,unit,quantity,minimum_stock
    FROM inventory
    WHERE quantity <= minimum_stock
    ORDER BY (quantity - minimum_stock) ASC, item_name ASC`);
  res.json({lowStock,lowStockCount:lowStock.length,checkedAt:new Date().toISOString()});
}));
app.get('/api/products',auth,allow('Owner / Manager','Cashier / Service Staff'),asyncRoute(async(req,res)=>{const [rows]=await db.query('SELECT * FROM products ORDER BY created_at DESC');res.json(rows)}));
app.post('/api/products',auth,allow('Owner / Manager'),asyncRoute(async(req,res)=>{
  const {name,category,description,price,image_url,available}=req.body;
  const priceValue=Number(price);
  if(!name||!category||!Number.isFinite(priceValue)||priceValue<0)return res.status(400).json({message:'Name, category and valid price are required.'});
  let image=null;try{image=cleanImage(image_url);}catch(error){return res.status(error.status||400).json({message:error.message});}
  const [r]=await db.execute('INSERT INTO products(name,category,description,price,image_url,available) VALUES(?,?,?,?,?,?)',[name,category,description||'',priceValue,image,available===undefined?1:(available?1:0)]);
  await log(req.user.id,'Created product','Products',r.insertId,name);
  res.status(201).json({id:r.insertId,message:'Product created.'});
}));
app.put('/api/products/:id',auth,allow('Owner / Manager'),asyncRoute(async(req,res)=>{
  const {name,category,description,price,available,image_url}=req.body;
  const priceValue=Number(price);
  if(!name||!category||!Number.isFinite(priceValue)||priceValue<0)return res.status(400).json({message:'Name, category and valid price are required.'});
  const hasImage=Object.prototype.hasOwnProperty.call(req.body,'image_url');
  let image=null;if(hasImage){try{image=cleanImage(image_url);}catch(error){return res.status(error.status||400).json({message:error.message});}}
  const values=[name,category,description||'',priceValue,available?1:0];
  let sql='UPDATE products SET name=?,category=?,description=?,price=?,available=?';
  if(hasImage){sql+=',image_url=?';values.push(image);}
  sql+=' WHERE id=?';values.push(req.params.id);
  await db.execute(sql,values);
  await log(req.user.id,'Updated product','Products',req.params.id,name);
  res.json({message:'Product updated.'});
}));
app.delete('/api/products/:id',auth,allow('Owner / Manager'),asyncRoute(async(req,res)=>{await db.execute('UPDATE products SET available=0 WHERE id=?',[req.params.id]);await log(req.user.id,'Archived product','Products',req.params.id);res.json({message:'Product archived.'})}));
app.get('/api/promos',auth,allow('Owner / Manager','Cashier / Service Staff'),asyncRoute(async(req,res)=>{
  const activeOnly=req.query.active==='1'||req.user.role!=='Owner / Manager';
  const where=activeOnly?"WHERE p.is_active=1 AND (p.starts_at IS NULL OR p.starts_at<=NOW()) AND (p.expires_at IS NULL OR p.expires_at>=NOW())":'';
  const [rows]=await db.query(`SELECT p.*,pr.name product_name,
    CASE WHEN p.is_active=0 THEN 'Inactive'
      WHEN p.starts_at IS NOT NULL AND p.starts_at>NOW() THEN 'Scheduled'
      WHEN p.expires_at IS NOT NULL AND p.expires_at<NOW() THEN 'Expired'
      ELSE 'Active' END promo_status
    FROM promos p LEFT JOIN products pr ON pr.id=p.product_id ${where}
    ORDER BY p.created_at DESC`);
  res.json(rows);
}));
app.post('/api/promos',auth,allow('Owner / Manager'),asyncRoute(async(req,res)=>{
  const promo=normalizePromo(req.body);
  await ensurePromoProduct(promo.product_id);
  const [r]=await db.execute('INSERT INTO promos(name,description,discount_type,discount_value,product_id,image_url,starts_at,expires_at,is_active,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',[promo.name,promo.description,promo.discount_type,promo.discount_value,promo.product_id,promo.image_url,promo.starts_at,promo.expires_at,promo.is_active,req.user.id]);
  await log(req.user.id,'Created promo','Promos',r.insertId,promo.name);
  res.status(201).json({id:r.insertId,message:'Promo created.'});
}));
app.put('/api/promos/:id',auth,allow('Owner / Manager'),asyncRoute(async(req,res)=>{
  const promo=normalizePromo(req.body);
  await ensurePromoProduct(promo.product_id);
  const hasImage=Object.prototype.hasOwnProperty.call(req.body,'image_url');
  const values=[promo.name,promo.description,promo.discount_type,promo.discount_value,promo.product_id,promo.starts_at,promo.expires_at,promo.is_active];
  let sql='UPDATE promos SET name=?,description=?,discount_type=?,discount_value=?,product_id=?,starts_at=?,expires_at=?,is_active=?';
  if(hasImage){sql+=',image_url=?';values.push(promo.image_url);}
  sql+=' WHERE id=?';values.push(req.params.id);
  const [result]=await db.execute(sql,values);
  if(!result.affectedRows)return res.status(404).json({message:'Promo not found.'});
  await log(req.user.id,'Updated promo','Promos',req.params.id,promo.name);
  res.json({message:'Promo updated.'});
}));
app.delete('/api/promos/:id',auth,allow('Owner / Manager'),asyncRoute(async(req,res)=>{
  const [result]=await db.execute('DELETE FROM promos WHERE id=?',[req.params.id]);
  if(!result.affectedRows)return res.status(404).json({message:'Promo not found.'});
  await log(req.user.id,'Deleted promo','Promos',req.params.id);
  res.json({message:'Promo deleted.'});
}));
app.get('/api/inventory',auth,allow('Owner / Manager','Inventory Personnel'),asyncRoute(async(req,res)=>{const [rows]=await db.query('SELECT * FROM inventory ORDER BY item_name');res.json(rows)}));
app.post('/api/inventory',auth,allow('Owner / Manager','Inventory Personnel'),asyncRoute(async(req,res)=>{const {item_name,category,unit,quantity,minimum_stock,purchase_cost,expiration_date}=req.body;if(!item_name||!unit)return res.status(400).json({message:'Item name and unit are required.'});const [r]=await db.execute('INSERT INTO inventory(item_name,category,unit,quantity,minimum_stock,purchase_cost,expiration_date) VALUES(?,?,?,?,?,?,?)',[item_name,category||'Other Supplies',unit,Number(quantity||0),Number(minimum_stock||0),Number(purchase_cost||0),expiration_date||null]);await log(req.user.id,'Added inventory item','Inventory',r.insertId,item_name);res.status(201).json({id:r.insertId})}));
app.post('/api/inventory/:id/movement',auth,allow('Owner / Manager','Inventory Personnel'),asyncRoute(async(req,res)=>{const {type,quantity,reason}=req.body;const amount=Number(quantity);if(!['Stock In','Stock Out'].includes(type)||!Number.isFinite(amount)||amount<=0)return res.status(400).json({message:'Enter a valid movement and quantity.'});const c=await db.getConnection();try{await c.beginTransaction();const [[item]]=await c.execute('SELECT * FROM inventory WHERE id=? FOR UPDATE',[req.params.id]);if(!item)throw new Error('Inventory item not found.');const next=item.quantity+(type==='Stock In'?amount:-amount);if(next<0)throw new Error('Insufficient stock. Stock cannot become negative.');await c.execute('UPDATE inventory SET quantity=? WHERE id=?',[next,item.id]);await c.execute('INSERT INTO stock_movements(inventory_id,user_id,movement_type,quantity,previous_quantity,new_quantity,reason) VALUES(?,?,?,?,?,?,?)',[item.id,req.user.id,type,amount,item.quantity,next,reason||'Manual adjustment']);await c.commit();await log(req.user.id,type,'Inventory',item.id,`${item.item_name}: ${amount} ${item.unit}`);res.json({message:'Stock updated.',quantity:next});}catch(e){await c.rollback();throw e;}finally{c.release();}}));
app.get('/api/orders',auth,allow('Owner / Manager','Cashier / Service Staff','Kitchen Personnel'),asyncRoute(async(req,res)=>{const [rows]=req.user.role==='Kitchen Personnel'?await db.query("SELECT * FROM orders WHERE status IN ('Confirmed','Preparing','Ready') ORDER BY created_at ASC"):await db.query('SELECT * FROM orders ORDER BY created_at DESC');res.json(rows)}));
app.get('/api/orders/:id',auth,allow('Owner / Manager','Cashier / Service Staff','Kitchen Personnel'),asyncRoute(async(req,res)=>{
  const [[order]]=await db.execute('SELECT * FROM orders WHERE id=? LIMIT 1',[req.params.id]);
  if(!order)return res.status(404).json({message:'Order not found.'});
  const [items]=await db.query('SELECT id,product_id,product_name,quantity,unit_price,subtotal FROM order_items WHERE order_id=? ORDER BY id ASC',[req.params.id]);
  res.json({...order,items});
}));
app.post('/api/orders',auth,allow('Owner / Manager','Cashier / Service Staff'),asyncRoute(async(req,res)=>{const {customer_name,order_type,items,special_instructions}=req.body;if(!Array.isArray(items)||!items.length)return res.status(400).json({message:'Add at least one product.'});const c=await db.getConnection();try{await c.beginTransaction();let total=0;const normalized=[];for(const item of items){const [[p]]=await c.execute('SELECT id,name,price FROM products WHERE id=? AND available=1',[item.product_id]);if(!p)throw new Error('A selected product is unavailable.');const qty=Math.max(1,Number(item.quantity)||1);total+=p.price*qty;normalized.push({...p,qty});}const orderNo='CM-'+Date.now().toString().slice(-8);const [r]=await c.execute('INSERT INTO orders(order_number,customer_name,order_type,total_amount,status,special_instructions,created_by) VALUES(?,?,?,?,?,?,?)',[orderNo,customer_name||'Walk-in Customer',order_type||'Dine-in',total,'Pending',special_instructions||'',req.user.id]);for(const p of normalized)await c.execute('INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price,subtotal) VALUES(?,?,?,?,?,?)',[r.insertId,p.id,p.name,p.qty,p.price,p.price*p.qty]);await c.commit();await log(req.user.id,'Created order','Orders',r.insertId,orderNo);res.status(201).json({id:r.insertId,order_number:orderNo,total_amount:total});}catch(e){await c.rollback();throw e;}finally{c.release();}}));
app.post('/api/pos/checkout',auth,allow('Owner / Manager','Cashier / Service Staff'),asyncRoute(async(req,res)=>{
  const {customer_name,order_type,items,special_instructions,promo_id,payment_method,amount_paid}=req.body;
  if(!String(customer_name||'').trim())return res.status(400).json({message:'Customer name is required.'});
  if(!Array.isArray(items)||!items.length)return res.status(400).json({message:'Add at least one product to the cart.'});
  const type=['Dine-in','Takeout','Advance Order','Event'].includes(order_type)?order_type:'Dine-in';
  const method=['Cash','GCash','Card'].includes(payment_method)?payment_method:'Cash';
  const c=await db.getConnection();
  try{
    await c.beginTransaction();
    let subtotal=0;const normalized=[];
    for(const item of items){
      const [[p]]=await c.execute('SELECT id,name,price FROM products WHERE id=? AND available=1',[item.product_id]);
      if(!p)throw httpError('A selected product is unavailable.');
      const qty=Math.max(1,Math.floor(Number(item.quantity)||1));
      subtotal+=Number(p.price)*qty;
      normalized.push({...p,qty});
    }
    subtotal=roundMoney(subtotal);
    let promo=null,discount=0;
    if(promo_id){
      const [[row]]=await c.execute("SELECT * FROM promos WHERE id=? AND is_active=1 AND (starts_at IS NULL OR starts_at<=NOW()) AND (expires_at IS NULL OR expires_at>=NOW())",[promo_id]);
      if(!row)throw httpError('The selected promo is no longer active.');
      promo=row;
      const base=promo.product_id?normalized.filter(p=>Number(p.id)===Number(promo.product_id)).reduce((sum,p)=>sum+Number(p.price)*p.qty,0):subtotal;
      if(base<=0)throw httpError(`The promo "${promo.name}" does not apply to any item in this order.`);
      discount=promo.discount_type==='Percent'?base*Number(promo.discount_value)/100:Math.min(Number(promo.discount_value),base);
      discount=roundMoney(discount);
    }
    const total=roundMoney(Math.max(0,subtotal-discount));
    let paid=roundMoney(amount_paid);
    if(method==='Cash'){if(!Number.isFinite(paid)||paid<total)throw httpError('Cash received is less than the order total.');}
    else paid=total;
    const change=roundMoney(Math.max(0,paid-total));
    const orderNo='CM-'+Date.now().toString().slice(-6)+Math.floor(Math.random()*90+10);
    const [r]=await c.execute('INSERT INTO orders(order_number,customer_name,order_type,subtotal,discount_amount,promo_id,promo_name,total_amount,payment_method,amount_paid,change_due,status,special_instructions,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[orderNo,customer_name||'Walk-in Customer',type,subtotal,discount,promo?.id||null,promo?.name||null,total,method,paid,change,'Confirmed',special_instructions||'',req.user.id]);
    for(const p of normalized)await c.execute('INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price,subtotal) VALUES(?,?,?,?,?,?)',[r.insertId,p.id,p.name,p.qty,Number(p.price),roundMoney(Number(p.price)*p.qty)]);
    await c.commit();
    await log(req.user.id,'POS sale completed','Orders',r.insertId,`${orderNo} · ${method} · ${total}`);
    res.status(201).json({id:r.insertId,order_number:orderNo,customer_name:customer_name||'Walk-in Customer',order_type:type,subtotal,discount_amount:discount,promo_id:promo?.id||null,promo_name:promo?.name||null,total_amount:total,payment_method:method,amount_paid:paid,change_due:change,status:'Confirmed',special_instructions:special_instructions||'',cashier_name:req.user.name,created_at:new Date().toISOString(),items:normalized.map(p=>({product_id:p.id,product_name:p.name,quantity:p.qty,unit_price:Number(p.price),subtotal:roundMoney(Number(p.price)*p.qty)}))});
  }catch(error){await c.rollback();throw error;}finally{c.release();}
}));
app.put('/api/orders/:id/status',auth,allow('Owner / Manager','Cashier / Service Staff','Kitchen Personnel'),asyncRoute(async(req,res)=>{
 const {status}=req.body;
 const [[o]]=await db.execute('SELECT status FROM orders WHERE id=?',[req.params.id]);
 if(!o)return res.status(404).json({message:'Order not found.'});
 const transitions={Pending:['Confirmed','Cancelled'],Confirmed:['Preparing','Cancelled'],Preparing:['Ready','Cancelled'],Ready:['Completed'],Completed:[],Cancelled:[]};
 if(!transitions[o.status]?.includes(status))return res.status(409).json({message:`Cannot change ${o.status} to ${status}.`});
 const role=req.user.role;
 const allowedForRole={
   'Owner / Manager':['Confirmed','Preparing','Ready','Completed','Cancelled'],
   'Cashier / Service Staff':['Confirmed','Completed','Cancelled'],
   'Kitchen Personnel':['Preparing','Ready']
 };
 if(!allowedForRole[role]?.includes(status))return res.status(403).json({message:'Your account is not allowed to perform this order status update.'});
 await db.execute('UPDATE orders SET status=? WHERE id=?',[status,req.params.id]);
 await log(req.user.id,`Order ${status}`,'Orders',req.params.id);
 res.json({message:`Order marked ${status}.`});
}));
app.get('/api/reservations',auth,allow('Owner / Manager','Cashier / Service Staff'),asyncRoute(async(req,res)=>{const [rows]=await db.query('SELECT * FROM reservations ORDER BY reservation_date DESC,start_time');res.json(rows)}));
app.post('/api/reservations',auth,allow('Owner / Manager','Cashier / Service Staff'),asyncRoute(async(req,res)=>{const {customer_name,contact_number,reservation_date,start_time,end_time,guests,event_type,table_arrangement,special_requests}=req.body;if(!customer_name||!reservation_date||!start_time||!guests)return res.status(400).json({message:'Complete the required reservation details.'});const [r]=await db.execute('INSERT INTO reservations(customer_name,contact_number,reservation_date,start_time,end_time,guests,event_type,table_arrangement,special_requests,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',[customer_name,contact_number||'',reservation_date,start_time,end_time||null,guests,event_type||'Regular Dining',table_arrangement||'',special_requests||'',req.user.id]);await log(req.user.id,'Created reservation','Reservations',r.insertId,customer_name);res.status(201).json({id:r.insertId})}));
app.get('/api/waste',auth,allow('Owner / Manager','Inventory Personnel'),asyncRoute(async(req,res)=>{const [rows]=await db.query('SELECT w.*,i.item_name,i.unit,u.name employee_name FROM waste_records w JOIN inventory i ON i.id=w.inventory_id LEFT JOIN users u ON u.id=w.user_id ORDER BY w.created_at DESC');res.json(rows)}));
app.post('/api/waste',auth,allow('Owner / Manager','Inventory Personnel'),asyncRoute(async(req,res)=>{const {inventory_id,quantity,category,reason}=req.body;const amount=Number(quantity);if(!inventory_id||!amount||amount<=0)return res.status(400).json({message:'Select an item and enter a valid quantity.'});const c=await db.getConnection();try{await c.beginTransaction();const [[item]]=await c.execute('SELECT * FROM inventory WHERE id=? FOR UPDATE',[inventory_id]);if(!item||item.quantity<amount)throw new Error('Insufficient inventory for this waste record.');const cost=Number(item.purchase_cost)*amount;await c.execute('UPDATE inventory SET quantity=quantity-? WHERE id=?',[amount,inventory_id]);const [r]=await c.execute('INSERT INTO waste_records(inventory_id,user_id,quantity,category,reason,estimated_cost) VALUES(?,?,?,?,?,?)',[inventory_id,req.user.id,amount,category||'Spoiled',reason||'',cost]);await c.execute("INSERT INTO stock_movements(inventory_id,user_id,movement_type,quantity,previous_quantity,new_quantity,reason) VALUES(?,?,?,?,?,?,?)",[inventory_id,req.user.id,'Waste',amount,item.quantity,item.quantity-amount,reason||'Waste record']);await c.commit();await log(req.user.id,'Recorded food waste','Waste',r.insertId,item.item_name);res.status(201).json({id:r.insertId,estimated_cost:cost});}catch(e){await c.rollback();throw e;}finally{c.release();}}));
app.get('/api/activity',auth,allow('Owner / Manager'),asyncRoute(async(req,res)=>{const [rows]=await db.query('SELECT a.*,u.name employee_name FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200');res.json(rows)}));
app.use((err,req,res,next)=>{console.error(err);res.status(err.status||500).json({message:err.message||'Internal server error.'});});
const PORT=process.env.PORT||5000;app.listen(PORT,()=>console.log(`Cafe Munaco API listening on port ${PORT}`));
