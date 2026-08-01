#include <bits/stdc++.h>
using namespace std;
void solve(string s)
{
for(int i=0;i<s.size();i++)
{
    if(s[i]=='0'){s.erase(s.begin()+i);break;}
}
for(int i=0;i<s.size();i++)
{
    if(s[i]=='1'){s.erase(s.begin()+i);break;}
}
cout<<s<<endl;
}
int main() {
    int n;
    cin>>n;
    while(n--)
    {
        string s;
        cin>>s;
        solve(s);
    }
}