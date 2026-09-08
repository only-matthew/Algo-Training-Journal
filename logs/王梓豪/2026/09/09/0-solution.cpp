#include<bits/stdc++.h>
using namespace std;
__int128 stoint128(string ks)
{
    __int128 ans=0;
    for(int i=0;i<(int)ks.size();i++)
    {
        ans*=10;
        ans+=ks[i]-'0';
    }
    return ans;
}
string to_string(__int128 ans)
{
    if(ans==0) return "0";
    string s;
    if (ans<0){
        s+='-';
        ans=-ans;
        s+=to_string(ans);
    }
    else 
    {   
        while(ans>0)
        {
            s+=(char)(ans%10+'0');
            ans/=10;
        }
        reverse(s.begin(),s.end());
    }
    return s;
}
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int x,y;
        string ks;
        __int128 k;
        cin>>x>>y>>ks;
        k=stoint128(ks);
        __int128 ans=0;
        if(x<y)
        {__int128 cnt=0;
            for(int i=0;i<k;i++)
            {
                if(y/x==1)break;
                ans+=(y%x);
                x++;
                y++;
                cnt++;
            }
            k-=cnt;
            ans+=k*(y%x);
        }
        else if(x>y)
        {
            ans+=k*(y%x);
        }
        else if(x==y)
        {
            ans=0;
        }
        cout<<to_string(ans)<<endl;
    }
}