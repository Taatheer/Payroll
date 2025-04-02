import streamlit as st
import pandas as pd
import xlsxwriter

# Streamlit app title
st.title("Payroll Data Analysis & Filtering System")

# File upload
uploaded_file = st.file_uploader("Upload Payroll CSV File", type=["csv"])

if uploaded_file:
    # Read CSV file
    df = pd.read_csv(uploaded_file, encoding='ISO-8859-1')

    st.success("File uploaded successfully!")
    
    # Display raw data preview
    st.subheader("Preview of Uploaded Data")
    st.dataframe(df)
    
    # Identify columns from K onwards (assuming 'K' is the 11th column, Python index = 10)
    numeric_cols = df.columns[10:]  # Select all columns from column K onwards

    # Convert only those columns to numeric
    for col in numeric_cols:
        df[col] = df[col].astype(str).str.replace(",", "").str.replace("$", "").str.strip()  # Clean formatting
        df[col] = pd.to_numeric(df[col], errors='coerce')  # Convert to numeric while keeping non-numeric values intact

    # Debug: Check if conversion worked
    # st.write(df.dtypes)  # Verify data types

    # Numeric column totals (starting from column K onwards)
    st.subheader("Total for Each Column")
    # Identify columns from K onwards (assuming K is the 11th column, Python index = 10)
    numeric_cols = df.columns[10:]  # Adjust index if needed
    # Convert only those columns to numeric
    df_numeric = df[numeric_cols].apply(pd.to_numeric, errors='coerce')
    # Compute total sum for only numerical columns (K onwards)
    total_values = df_numeric.sum()
    # Display totals in a dataframe
    st.dataframe(total_values)

   # Unique country list
    country_list = df['Location'].unique().tolist()
    
    # Country selection
    st.subheader("Filter by Country")
    selected_country = st.selectbox("Select a Country", country_list)
    
    # Filter data by selected country
    country_data = df[df['Location'] == selected_country]
    
    # Unique department list for selected country
    department_list = country_data['Organization'].unique().tolist()
    
    # Department selection within the selected country
    st.subheader("Filter by Department")
    selected_department = st.selectbox("Select a Department", department_list)
    
    # Filter by department within the selected country
    department_data = country_data[country_data['Organization'] == selected_department]
    
    st.write(f"Data for {selected_department} in {selected_country}")
    st.dataframe(department_data)
    
    # Total for selected department
    st.subheader("Total for Selected Department")
    department_totals = department_data[numeric_cols].apply(pd.to_numeric, errors='coerce').sum()
    st.dataframe(department_totals)
    
    # Generate summary tables for each country separately and save on the same Excel sheet with country names on top
    st.subheader("Download Country-wise Departmental Summary")
    with pd.ExcelWriter("country_summary.xlsx", engine="xlsxwriter") as writer:
        workbook = writer.book
        worksheet = workbook.add_worksheet("Summary")
        writer.sheets["Summary"] = worksheet
        start_col = 0
        for country in country_list:
            country_df = df[df['Location'] == country]
            summary_table = country_df.groupby("Organization")[numeric_cols].sum().T
            summary_table["Total"] = summary_table.sum(axis=1)
            
            # Write country name above the table
            worksheet.write(0, start_col, country)
            summary_table.to_excel(writer, sheet_name="Summary", startcol=start_col, startrow=2)
            start_col += len(summary_table.columns) + 2  # Space between tables
        writer.close()
    
    with open("country_summary.xlsx", "rb") as file:
        st.download_button("Download Summary Report", file, file_name="Country_Department_Summary.xlsx", mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")



# Instructions for Deployment
# st.markdown("""### Deployment Guide:
# 1. Install dependencies: `pip install streamlit pandas`
# 2. Run locally: `streamlit run script.py`
# 3. Deploy for free on Streamlit Cloud: [streamlit.io](https://share.streamlit.io/)
# """)
