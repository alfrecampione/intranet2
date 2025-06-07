-- CreateTable
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalInfo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "LegalName" TEXT NOT NULL,
    "PrefferredName" TEXT,
    "LegalSex" TEXT NOT NULL,
    "DateOfBirth" TIMESTAMP(3) NOT NULL,
    "SSN" TEXT NOT NULL,
    "PhotoPath" TEXT,

    CONSTRAINT "PersonalInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactInfo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personalEmail" TEXT NOT NULL,
    "isPersonalEmailVisible" BOOLEAN NOT NULL DEFAULT false,
    "personalPhone" TEXT,
    "isPersonalPhoneVisible" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "workEmail" TEXT,
    "workPhone" TEXT,
    "preferedContactMethod" TEXT NOT NULL,
    "sendMessagePersonalPhone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "Fullname" TEXT NOT NULL,
    "Phone" TEXT NOT NULL,
    "secondaryPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxInfo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nameOnTaxReturn" TEXT NOT NULL,
    "bussinesName" TEXT,
    "taxClassification" TEXT NOT NULL,
    "taxIdNumType" TEXT,
    "employerIdNum" TEXT,
    "llcClassification" TEXT,
    "otherClassification" TEXT,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "signatureTaxDoc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankAccountType" TEXT,
    "bankAccountNum" TEXT NOT NULL,
    "bankRoutingNum" TEXT NOT NULL,
    "accountNickname" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "directDepositForm" TEXT NOT NULL,
    "driverLicense" TEXT NOT NULL,
    "EINconfirmation" TEXT NOT NULL,
    "EmploymentAuthCardBack" TEXT NOT NULL,
    "EmploymentAuthCardFront" TEXT NOT NULL,
    "EmploymentAuthExtensionLetter" TEXT NOT NULL,
    "eANDo" TEXT NOT NULL,
    "GTDisciplinaryPolicy" TEXT NOT NULL,
    "permanentResidentCard" TEXT NOT NULL,
    "proLicense" TEXT NOT NULL,
    "socialSecurityCard" TEXT NOT NULL,
    "USpassport" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_session_expire" ON "session"("expire");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalInfo_userId_key" ON "PersonalInfo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactInfo_userId_key" ON "ContactInfo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxInfo_userId_key" ON "TaxInfo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Documents_userId_key" ON "Documents"("userId");

-- AddForeignKey
ALTER TABLE "PersonalInfo" ADD CONSTRAINT "PersonalInfo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactInfo" ADD CONSTRAINT "ContactInfo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInfo" ADD CONSTRAINT "TaxInfo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documents" ADD CONSTRAINT "Documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
