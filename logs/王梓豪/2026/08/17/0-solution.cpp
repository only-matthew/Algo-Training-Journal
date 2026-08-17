#include <bits/stdc++.h>
using namespace std;
int main()
{
ios::sync_with_stdio(false);
cin.tie(nullptr);
int t;
cin>>t;
while(t--)
{
    int n,m;
    cin>>n>>m;
    vector<string> s(n);
    vector<string> a(m);
    set<char> st;
    for(int i=0;i<n;i++)
    {
        cin>>s[i];
        st.insert(tolower(s[i][0]));
    }
    for(int i=0;i<m;i++)
    {
        cin>>a[i];
    }
    bool flag=1;
    for(int i=0;i<m;i++)
    {if(flag)
        {for(int j=0;j<a[i].size();j++)
        {
            if(st.find(tolower(a[i][j]))==st.end())
            {
                cout<<"NO"<<endl;
                flag=0;
                break;
            }
        }}
        else
        break;
    }
    if(flag)
    {
        cout<<"YES"<<endl;
    }
}
}