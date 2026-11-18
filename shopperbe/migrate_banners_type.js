require('dotenv').config();
const pool = require('./db');

async function migrate() {
  try {
    console.log("Adding type column to banners table if not exists...");
    await pool.query(`
      ALTER TABLE banners 
      ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'homepage_hero';
    `);

    await pool.query(`
      UPDATE banners SET type = 'homepage_hero' WHERE type IS NULL;
    `);

    // Check if collection banners exist
    const collRes = await pool.query("SELECT COUNT(*) FROM banners WHERE type = 'collection_banner'");
    if (parseInt(collRes.rows[0].count, 10) === 0) {
      console.log("Seeding initial Beautiful Collection banners...");
      const initialCollections = [
        {
          title: "Wedding Collection",
          image_url: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80",
          link_url: "/collection/wedding",
          type: "collection_banner"
        },
        {
          title: "Festival Collection",
          image_url: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80",
          link_url: "/collection/festival",
          type: "collection_banner"
        },
        {
          title: "Office Wear",
          image_url: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80",
          link_url: "/collection/office",
          type: "collection_banner"
        },
        {
          title: "Casual Wear",
          image_url: "https://images.unsplash.com/photo-1606902965551-dce093cda6e7?w=800&q=80",
          link_url: "/collection/casual",
          type: "collection_banner"
        }
      ];

      for (const c of initialCollections) {
        await pool.query(
          "INSERT INTO banners (title, image_url, link_url, type, is_active) VALUES ($1, $2, $3, $4, true)",
          [c.title, c.image_url, c.link_url, c.type]
        );
      }
    }

    // Check if category banner exists
    const catRes = await pool.query("SELECT COUNT(*) FROM banners WHERE type = 'category_banner'");
    if (parseInt(catRes.rows[0].count, 10) === 0) {
      console.log("Seeding initial Category / Shop page banner...");
      await pool.query(
        "INSERT INTO banners (title, image_url, link_url, type, is_active) VALUES ($1, $2, $3, $4, true)",
        [
          "Grand Festive Sale - Flat Discounts on Sarees & Ethnic Wear",
          "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?q=80&w=1200&auto=format&fit=crop",
          "/category/all",
          "category_banner"
        ]
      );
    }

    console.log("✅ Banners type migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration error:", err);
  } finally {
    await pool.end();
  }
}

migrate();
