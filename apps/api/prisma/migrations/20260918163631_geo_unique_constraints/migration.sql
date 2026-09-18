-- CreateIndex
CREATE UNIQUE INDEX "districts_cityId_nameUk_key" ON "districts"("cityId", "nameUk");

-- CreateIndex
CREATE UNIQUE INDEX "regions_countryCode_nameUk_key" ON "regions"("countryCode", "nameUk");
