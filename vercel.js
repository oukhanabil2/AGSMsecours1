{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://script.google.com/macros/s/AKfycbxwlE0KOxF68qKG7p5EgHAqkKv4z2rpTCubn707iBlN81C70tpKS3XUN_Pp0L6PlpLvKA/exec?tab=$1"
    }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET, POST, DELETE, OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type" }
      ]
    }
  ]
}
