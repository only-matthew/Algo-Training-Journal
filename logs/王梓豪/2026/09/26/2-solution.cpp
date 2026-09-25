#include <bits/stdc++.h>
using namespace std;
 
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;char ch;
        string s;
        cin>>n>>ch>>s;
        int cnt=0;
        for(int i=0;i<n/2;i++)
        {
            if(s[i]!=s[n-i-1])
            {
                cnt++;
                if(s[i]!=ch&&s[n-1-i]!=ch)cnt++;
            }
        }
        cout<<cnt<<endl;
    }
}