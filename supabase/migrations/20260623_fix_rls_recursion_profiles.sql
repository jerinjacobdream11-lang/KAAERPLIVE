-- FIX RLS INFINITE RECURSION ON PROFILES TABLE
-- Description: Redefines get_my_company_id() as SECURITY DEFINER to bypass RLS checks and drops/recreates profile policies to avoid infinite recursion.

CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Direct lookup with security definer to bypass RLS for this specific query
  SELECT company_id INTO v_company_id
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing problematic RLS policy
DROP POLICY IF EXISTS "Users can only see profiles in their company" ON profiles;

-- Create optimized non-recursive policies
DROP POLICY IF EXISTS "Users can see own profile" ON profiles;
CREATE POLICY "Users can see own profile" ON profiles
    FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can see colleagues" ON profiles;
CREATE POLICY "Users can see colleagues" ON profiles
    FOR SELECT USING (company_id = get_my_company_id());
