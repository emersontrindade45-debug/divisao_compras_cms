import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não configurado");
}

const password = process.argv[2] ?? "admin123";
const passwordHash = bcrypt.hashSync(password, 10);

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.update({
  where: { email: "admin@cms.santos.sp.gov.br" },
  data: { passwordHash },
});

console.log(`Senha atualizada para ${user.email}`);

await prisma.$disconnect();
