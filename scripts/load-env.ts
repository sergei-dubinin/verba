// Импортируется первым: до него никто не должен прочитать DATABASE_URL.
import { config } from "dotenv";

config({ quiet: true });
