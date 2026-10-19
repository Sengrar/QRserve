-- CreateIndex
CREATE INDEX "MenuItem_categoryId_isAvailable_idx" ON "MenuItem"("categoryId", "isAvailable");

-- CreateIndex
CREATE INDEX "Order_restaurantId_createdAt_idx" ON "Order"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_restaurantId_status_idx" ON "Order"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_restaurantId_status_idx" ON "ServiceRequest"("restaurantId", "status");
