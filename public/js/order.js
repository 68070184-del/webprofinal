const foodModal = document.getElementById('foodDetailModal');
const serverMsgModal = document.getElementById('serverMsgModal');
const cartModal = document.getElementById('cartModal');
const historyModal = document.getElementById("historyModal");

function openFoodModal(id, name, price) {
    document.getElementById('modalItemId').value = id;
    document.getElementById('modalInputName').value = name;
    document.getElementById('modalInputPrice').value = price;
    
    document.getElementById('modalFoodName').innerText = name;
    document.getElementById('modalFoodPrice').innerText = price;
    document.getElementById('modalFoodImg').src = `/img/${id}.jpg`;
    document.getElementById('modalQuantity').value = 1; // รีเซ็ตจำนวนเป็น 1 เสมอเมื่อเปิดใหม่
    
    foodModal.classList.add('active');
}

function closeFoodModal() {
    foodModal.classList.remove('active');
}

function handleFoodBackdropClick(e) {
    if (e.target === foodModal) {
        closeFoodModal();
    }
}

function showServerMsg(title, msg, isSuccess = true) {
    document.getElementById('serverMsgTitle').innerText = title;
    document.getElementById('serverMsgText').innerText = msg;
    const icon = document.getElementById('serverMsgIcon');
    if (isSuccess) {
        icon.className = "bi bi-check-circle-fill text-success";
    } else {
        icon.className = "bi bi-exclamation-circle-fill text-danger";
    }
    serverMsgModal.classList.add('active');
}

function closeServerMsgModal() {
    serverMsgModal.classList.remove('active');
}

async function submitAddToCart(e) {
    e.preventDefault();
    const form = document.getElementById("addToCartForm");
    const payload = {
        item_id: form.item_id.value,
        name: form.name.value,
        price: form.price.value,
        quantity: form.quantity.value
    }

    try {
        const res = await fetch("/add-to-cart", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });
        const result = await res.json()

        closeFoodModal();

        if (res.ok) {
            document.getElementById("cartCount").innerText = result.totalCartItems;
            showServerMsg("สำเร็จ", result.message, true);
        } else {
            showServerMsg("ล้มเหลว", result.message)
        }
    } catch (err) {
        console.log(err)
        closeFoodModal();
        showServerMsg("ข้อผิดพลาด","ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้",false);
    }
}

function changeModalQty(step) {
    const qtyInput = document.getElementById(`modalQuantity`);
    let currentQty = parseInt(qtyInput.value, 10) || 1;
    currentQty += step;

    // จำกัดไม่ให้ต่ำกว่า 1
    if (currentQty < 1) {
        currentQty = 1;
    }

    qtyInput.value = currentQty;
}
function selectedCategory(category) {
    const foodCards = document.querySelectorAll('.menu-item');
    foodCards.forEach(card => {
        if (category === "all" || card.classList.contains(category)) {
            card.style.display = "block";
        } else {
            card.style.display = 'none';
        }
    });
}

        // ฟังก์ชันเรนเดอร์เนื้อหาในตะกร้า
function renderCartUI(cart, totalItems) {
    const container = document.getElementById('cartItemsContainer');
    container.innerHTML = '';

    let totalPrice = 0;
    if (cart && cart.length > 0) {
        totalPrice = cart.reduce((sum, item) => sum + (parseFloat(item.item_price || 0) * item.item_quantity), 0);
    }

    // อัปเดตตัวเลขรวม
    document.getElementById('cartModalTotalQty').innerText = totalItems;
    document.getElementById('cartModalTotalPrice').innerText = totalPrice.toLocaleString();
    document.getElementById('cartCount').innerText = totalItems;

    if (!cart || cart.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4">ไม่มีสินค้าในตะกร้า</div>';
        document.getElementById('btnSubmitOrder').disabled = true;
        return;
    }

    document.getElementById('btnSubmitOrder').disabled = false;

    // วนลูปสร้างแถวสินค้าพร้อมปุ่มควบคุม [-] [จำนวน] [+] และปุ่มลบ
    cart.forEach(item => {
        container.innerHTML += `
            <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                <div style="max-width: 50%;">
                    <div class="fw-semibold text-truncate">${item.item_name}</div>
                    <small class="text-danger fw-bold">${item.item_price} ฿</small>
                </div>
                
                <!-- ชุดปุ่มปรับจำนวนและลบ -->
                <div class="d-flex align-items-center gap-2">
                    <div class="d-flex align-items-center border rounded bg-light px-1" style="height: 30px;">
                        <button type="button" class="btn btn-sm text-danger fw-bold p-0 px-2" 
                                onclick="updateCartItem('${item.item_id}', -1)">-</button>
                        
                        <span class="fw-bold px-1 text-center" style="min-width: 24px; font-size: 0.9rem;">
                            ${item.item_quantity}
                        </span>
                        
                        <button type="button" class="btn btn-sm text-danger fw-bold p-0 px-2" 
                                onclick="updateCartItem('${item.item_id}', 1)">+</button>
                    </div>

                    <!-- ปุ่มลบรายการ (ไอคอนถังขยะ) -->
                    <button type="button" class="btn btn-sm text-muted p-1" 
                            onclick="updateCartItem('${item.item_id}', 'remove')" title="ลบรายการ">
                        <i class="bi bi-trash3 text-danger fs-6"></i>
                    </button>
                </div>
            </div>
        `;
    });
}

// ฟังก์ชันเปิดดูตะกร้า (เรียก API /get-cart)
async function openCartModal() {
    try {
        const res = await fetch('/get-cart');
        const data = await res.json();
        renderCartUI(data.cart, data.totalItems);
        cartModal.classList.add('active');
    } catch (err) {
        console.error("Error loading cart:", err);
    }
}

function closeCartModal() {
    cartModal.classList.remove('active');
}

// ✅ ฟังก์ชันปิดเมื่อคลิกพื้นหลังมืดของ Cart Modal
function handleCartBackdropClick(e) {
    if (e.target === cartModal) {
        closeCartModal();
    }
}

// ฟังก์ชันส่งคำขอไปอัปเดตจำนวนหรือลบรายการ
async function updateCartItem(itemId, step) {
    try {
        const res = await fetch('/update-cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_id: itemId, step: step })
        });
        const data = await res.json();
        
        if (res.ok) {
            // เรนเดอร์ตระกร้าใหม่ทันทีโดยไม่ต้องรีเฟรชหน้า
            renderCartUI(data.cart, data.totalItems);
        }
    } catch (err) {
        console.error("Error updating cart:", err);
    }
}

        // ฟังก์ชันกดยืนยันสั่งอาหารส่งเข้าครัว
async function submitOrder(e) {
    e.preventDefault(); // ป้องกันหน้าเว็บรีโหลดจาก Form Submit

    const btnSubmit = document.getElementById('btnSubmitOrder');
    
    // 1. ปิดปุ่มชั่วคราวและแสดงสถานะกำลังโหลด ป้องกันการกดเบิ้ลซ้ำๆ
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerText = 'กำลังส่งเข้าครัว...';
    }

    try {
        // 2. ส่ง Request ไปยัง Backend route /submit-order
        const res = await fetch('/submit-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await res.json();

        // 3. ปิด Cart Modal
        closeCartModal();

        if (res.ok) {
            // เคลียร์ตัวเลข Badge ตะกร้าที่มุมขวาล่างเป็น 0
            const cartCountEl = document.getElementById('cartCount');
            if (cartCountEl) {
                cartCountEl.innerText = 0;
            }

            // แสดง Modal แจ้งเตือนข้อความสำเร็จ
            showServerMsg('สำเร็จ', result.message || 'ส่งรายการอาหารเข้าครัวเรียบร้อยแล้ว!', true);
        } else {
            // กรณีเกิดข้อผิดพลาดจากฝั่ง Backend (เช่น ตะกร้าว่างเปล่า หรือเกิด Database error)
            showServerMsg('แจ้งเตือน', result.message || result.error || 'เกิดข้อผิดพลาดในการสั่งอาหาร', false);
        }

    } catch (err) {
        console.error('Error submitting order:', err);
        closeCartModal();
        showServerMsg('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง', false);
    } finally {
        // 4. คืนสถานะปุ่มกลับมาเป็นปกติ
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerText = 'ส่งเข้าครัว';
        }
    }
}

async function openHistoryModal() {
    const container = document.getElementById('historyItemsContainer');
    const grandTotalEl = document.getElementById('historyGrandTotal');
    
    container.innerHTML = '<div class="text-center text-muted py-3">กำลังโหลด...</div>';
    if (grandTotalEl) grandTotalEl.innerText = '0';
    historyModal.classList.add('active');

    try {
        const res = await fetch('/order-history');
        const data = await res.json();
        container.innerHTML = '';

        if (!data.history || data.history.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-4">ยังไม่มีประวัติการสั่ง</div>';
            if (grandTotalEl) grandTotalEl.innerText = '0';
            return;
        }

        // 1. คำนวณผลรวมราคาของทุกรายการในประวัติ
        const grandTotal = data.history.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
        if (grandTotalEl) {
            grandTotalEl.innerText = grandTotal.toLocaleString();
        }

        // 2. วนลูปแสดงแต่ละรายการ
        data.history.forEach(item => {
            container.innerHTML += `
                <div class="d-flex justify-content-between align-items-center border-bottom py-2">
                    <div>
                        <div class="fw-semibold">${item.name}</div>
                        <small class="text-muted">บิล #${item.order_id}</small>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-secondary">x${item.quantity}</span>
                        <div class="text-danger small fw-bold mt-1">${(item.subtotal || 0).toLocaleString()} ฿</div>
                    </div>
                </div>
            `;
        });
    } catch (err) {
        console.error("Error loading order history:", err);
        container.innerHTML = '<div class="text-danger text-center py-3">เกิดข้อผิดพลาดในการโหลดประวัติ</div>';
    }
}

function closeHistoryModal() {
    historyModal.classList.remove('active');
}

function handleHistoryBackdropClick(e) {
    if (e.target === historyModal) {
        closeHistoryModal();
    }
}