def connect() -> str:
    SERVER: str = '10.16.165.85, 1433'
    DATABASE: str = 'ScrapManagementSystemDB'
    USERNAME: str = 'Sekani'
    PASSWORD: str = 'Jokerlife'
    

    conn_str = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={SERVER};DATABASE={DATABASE};UID={USERNAME};PWD={PASSWORD};TrustServerCertificate=yes;"
    )
    return conn_str










    
